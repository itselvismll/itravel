import { supabase } from './supabase';
import { ensurePlanCoordinates } from '../utils/planGeography';
import { itineraryFromRows, itineraryToRowsPayload } from '../utils/tripItinerary';

// Colunas da viagem, mais a MINHA linha de participante e o roteiro normalizado.
//
// `trip_members!inner` com o filtro por user_id traz uma linha só — a de quem
// está pedindo. É de lá que sai `is_active_on_map` (que saiu de travel_plans na
// migração 20260915120000, porque a viagem no globo é estado de quem olha) e o
// `role`, que a UI vai usar para saber quem pode editar.
const TRIP_SELECT = `
  *,
  trip_members!inner (user_id, role, status, is_active_on_map),
  trip_days (
    id, day_number, date, theme,
    trip_activities (
      id, position, period, title, description, location, duration,
      estimated_cost, map_query, official_url, purchase_note, indoor,
      latitude, longitude, coordinate_source, approximate_coordinate, category,
      rating, review_count, opening_hours, verification_source, place_id, extra
    )
  )
`;

/**
 * Achata o registro do Supabase no formato que o app já usa.
 *
 * O app inteiro lê `record.plan_data.days[]` e `record.is_active_on_map`. A
 * fonte desses dois mudou de lugar no banco — o roteiro virou linhas, a flag do
 * globo virou coluna do participante — e esta função é o único lugar que precisa
 * saber disso. Nenhuma tela mudou.
 *
 * O `plan_data` gravado continua servindo de fallback: viagem antiga que ainda
 * não tenha linha em trip_days lê do jsonb, como sempre leu.
 */
const flattenTripRecord = (record) => {
  const membership = Array.isArray(record?.trip_members) ? record.trip_members[0] : null;
  const normalized = itineraryFromRows(record?.trip_days);

  const { trip_members: _members, trip_days: _days, ...trip } = record ?? {};

  return {
    ...trip,
    plan_data: normalized
      ? { ...(record?.plan_data ?? {}), days: normalized }
      : record?.plan_data,
    is_active_on_map: Boolean(membership?.is_active_on_map),
    member_role: membership?.role || null,
    member_status: membership?.status || null,
  };
};

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

  // Duas diferenças entre criar e atualizar, e as duas são de permissão:
  //
  // 1. `user_id` só vai no INSERT. Ele é o dono denormalizado, e mandá-lo num
  //    update faria um editor convidado virar dono da viagem só por salvar — a
  //    policy "Editors update trips" deixaria passar, porque ela pergunta se a
  //    pessoa pode editar, não de quem é a viagem.
  //
  // 2. O update não filtra mais por `user_id`: quem pode gravar é quem a policy
  //    deixa (dono OU editor). Manter o filtro faria o convidado salvar "com
  //    sucesso" sem alterar nada — zero linhas afetadas não é erro no PostgREST.
  const query = planId
    ? supabase.from('travel_plans').update(payload).eq('id', planId)
    : supabase.from('travel_plans').insert({ ...payload, user_id: user.id });

  const { data, error } = await query.select().single();
  if (error) {
    // O fallback local vale para roteiro NOVO ou para um que já era local. Um
    // roteiro que existe no servidor nunca vira local: ele pode ter outros
    // participantes, e uma cópia no localStorage de um deles não teria como
    // sincronizar com ninguém — as edições dos outros sumiriam da tela dele, e
    // as dele nunca chegariam a eles.
    const isRemotePlan = Boolean(planId) && !planId.startsWith('local-');
    if (isRemotePlan) {
      return {
        success: false,
        error: 'Não foi possível salvar agora. Verifique a conexão e tente de novo.',
      };
    }

    const localPlan = saveLocalPlan({ ...payload, user_id: user.id, id: planId || null });
    return {
      success: true,
      data: localPlan,
      warning: 'Roteiro salvo somente neste dispositivo durante o desenvolvimento local.',
    };
  }

  // O roteiro em linhas, que é o caminho novo de leitura e escrita. O jsonb
  // acima continua gravado como rede de segurança desta fase — se algo der
  // errado aqui, a viagem ainda tem o roteiro inteiro.
  const { error: itineraryError } = await supabase.rpc('replace_trip_itinerary', {
    p_trip_id: data.id,
    p_days: itineraryToRowsPayload(plan),
  });

  return {
    success: true,
    data,
    warning: itineraryError
      ? 'O roteiro foi salvo, mas a sincronização com os participantes falhou. Salve de novo para compartilhar as mudanças.'
      : undefined,
  };
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

  // Sem `.eq('user_id')`: a lista agora é "as viagens de que eu participo", e
  // quem decide isso é a policy "Members read trips" (via trip_members). Filtrar
  // por dono aqui esconderia justamente as viagens compartilhadas comigo.
  const { data, error } = await supabase
    .from('travel_plans')
    .select(TRIP_SELECT)
    .eq('trip_members.user_id', user.id)
    .order('updated_at', { ascending: false });

  let remoteRecords = error ? null : (data || []).map(flattenTripRecord);
  let warning = error?.message;

  // REDE DE SEGURANÇA, e ela existe por um motivo concreto.
  //
  // Uma consulta que falha entregava uma lista vazia, e lista vazia na tela lê
  // como "você não tem nenhum roteiro salvo" — indistinguível da verdade. Foi
  // exatamente assim que a ambiguidade de FK da Fase 0 (PGRST201, corrigida em
  // 20260916120000) apagou as viagens de todo mundo da tela sem uma mensagem
  // sequer.
  //
  // Então quando a consulta rica falha, a pobre ainda tenta: sem embed nenhum,
  // ela depende só da RLS e devolve as viagens com o roteiro vindo do
  // `plan_data`. O usuário vê as viagens dele; o que se perde é o roteiro
  // normalizado e a marcação do globo, não a lista.
  // Quando a lista vem pelo caminho degradado, ninguém sabe qual viagem está no
  // globo — e "não sei" não pode virar "nenhuma".
  let activeUnknown = false;

  if (error) {
    const [fallback, membership] = await Promise.all([
      supabase.from('travel_plans').select('*').order('updated_at', { ascending: false }),
      // A marcação do globo mora em trip_members desde a Fase 0 (a coluna saiu de
      // travel_plans). Sem esta segunda consulta, o caminho degradado devolveria
      // todas as viagens com `is_active_on_map` indefinido — e o globo
      // "desaplicaria" o roteiro sozinho, que foi exatamente o que aconteceu ao
      // voltar do app de mapas.
      supabase.from('trip_members').select('trip_id, role, status, is_active_on_map')
        .eq('user_id', user.id),
    ]);

    if (!fallback.error) {
      const byTrip = new Map(
        (membership.data || []).map((row) => [row.trip_id, row])
      );
      activeUnknown = Boolean(membership.error);

      remoteRecords = (fallback.data || []).map((record) => {
        const row = byTrip.get(record.id);
        return {
          ...record,
          is_active_on_map: Boolean(row?.is_active_on_map),
          member_role: row?.role || null,
          member_status: row?.status || null,
        };
      });
      warning = `Algumas informações da viagem não carregaram (${error.message}).`;
    }
  }

  const localPlans = readLocalPlans();

  // Falhou dos dois jeitos: é erro, e a tela precisa dizer isso em vez de
  // mostrar um vazio que mente.
  if (!remoteRecords) {
    return {
      success: false,
      error: error?.message || 'Não foi possível carregar seus roteiros.',
      data: await Promise.all(localPlans.map(normalizeStoredPlan)),
      activeUnknown: true,
    };
  }

  return {
    success: true,
    data: await Promise.all([...localPlans, ...remoteRecords].map(normalizeStoredPlan)),
    // Quem consome decide o que fazer com "a lista veio, mas sem saber qual
    // está no globo" — ver nextActivePlan em activePlanService.
    activeUnknown,
    warning,
  };
};

export const deleteTripPlan = async (planId) => {
  writeLocalPlans(readLocalPlans().filter(plan => plan.id !== planId));
  if (planId?.startsWith('local-')) return { success: true };
  const { error } = await supabase.from('travel_plans').delete().eq('id', planId);
  return { success: !error, error: error?.message };
};
