import { supabase } from './supabase';
import { ensurePlanCoordinates } from '../utils/planGeography';

// Roteiros salvos antes de a Edge Function passar a garantir coordenada/categoria/ordem
// são normalizados na leitura, sem rede — o suficiente para o globo não receber um plano
// com campos ausentes. O que estiver faltando é preenchido na próxima geração.
const normalizeStoredPlan = async (record) => (
  record?.plan_data?.days?.length
    ? { ...record, plan_data: await ensurePlanCoordinates(record.plan_data) }
    : record
);

const LOCAL_STORAGE_KEY = 'journi.localTravelPlans';
let memoryPlans = [];

const readLocalPlans = () => {
  if (typeof globalThis.localStorage === 'undefined') return memoryPlans;
  try {
    return JSON.parse(globalThis.localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeLocalPlans = (plans) => {
  memoryPlans = plans;
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(plans));
  }
};

const saveLocalPlan = (record) => {
  const plans = readLocalPlans();
  const existingIndex = plans.findIndex(item => item.id === record.id);
  const nextRecord = {
    ...record,
    id: record.id || `local-${Date.now()}`,
    updated_at: new Date().toISOString(),
    created_at: record.created_at || new Date().toISOString(),
    local_only: true,
  };
  if (existingIndex >= 0) plans[existingIndex] = nextRecord;
  else plans.unshift(nextRecord);
  writeLocalPlans(plans);
  return nextRecord;
};

export const saveTripPlan = async ({ planId, request, plan }) => {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Entre novamente para salvar seu roteiro.' };
  }

  const payload = {
    user_id: user.id,
    title: plan.title || `Viagem para ${request.destination}`,
    destination: request.destination,
    origin: request.origin || null,
    start_date: request.startDate || null,
    end_date: request.endDate || null,
    travelers: Number(request.travelers) || 1,
    budget: request.budget ? Number(request.budget) : null,
    currency: request.budgetCurrency || request.currency || 'BRL',
    status: 'planned',
    request_data: request,
    plan_data: plan,
  };

  const query = planId
    ? supabase.from('travel_plans').update(payload).eq('id', planId).eq('user_id', user.id)
    : supabase.from('travel_plans').insert(payload);

  const { data, error } = await query.select().single();
  if (error) {
    const localPlan = saveLocalPlan({ ...payload, id: planId?.startsWith('local-') ? planId : null });
    return {
      success: true,
      data: localPlan,
      warning: 'Roteiro salvo somente neste dispositivo durante o desenvolvimento local.',
    };
  }
  return { success: true, data };
};

export const getSavedTripPlans = async () => {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return {
      success: true,
      data: await Promise.all(readLocalPlans().map(normalizeStoredPlan)),
      warning: 'Exibindo roteiros locais.',
    };
  }

  const { data, error } = await supabase
    .from('travel_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  const remotePlans = error ? [] : (data || []);
  const localPlans = readLocalPlans();
  return {
    success: true,
    data: await Promise.all([...localPlans, ...remotePlans].map(normalizeStoredPlan)),
    warning: error?.message,
  };
};

export const deleteTripPlan = async (planId) => {
  writeLocalPlans(readLocalPlans().filter(plan => plan.id !== planId));
  if (planId?.startsWith('local-')) return { success: true };
  const { error } = await supabase.from('travel_plans').delete().eq('id', planId);
  return { success: !error, error: error?.message };
};
