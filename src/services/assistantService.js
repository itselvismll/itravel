import { supabase } from './supabase';

const BASE_ASSISTANT_TIMEOUT_MS = 150000;
const activeAssistantRequests = new Map();

export const TRAVEL_INTERESTS = [
  'Cultura', 'Gastronomia', 'Natureza', 'Praia', 'História',
  'Vida noturna', 'Compras', 'Aventura', 'Fotografia', 'Descanso',
];

export const TRAVEL_PACES = [
  { id: 'calm', label: 'Tranquilo' },
  { id: 'balanced', label: 'Equilibrado' },
  { id: 'intense', label: 'Intenso' },
];

const executeAssistantRequest = async (payload) => {
  const controller = new AbortController();
  const requestedDuration = Number(payload?.planRequest?.duration) || 3;
  const timeoutMs = Math.min(300000, Math.max(BASE_ASSISTANT_TIMEOUT_MS, requestedDuration * 10000));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const refreshResult = await supabase.auth.refreshSession();
      session = refreshResult.data.session;
    }

    if (!session?.access_token) {
      return { success: false, error: 'Sua sessão expirou. Entre novamente para usar o planejador.' };
    }

    const { data, error } = await supabase.functions.invoke('travel-assistant', {
      body: payload,
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    });

    if (error) {
      let functionError;
      try {
        functionError = await error.context?.json();
      } catch {
        functionError = null;
      }
      return {
        success: false,
        error: functionError?.error || 'O planejador está temporariamente indisponível.',
      };
    }

    if (!data?.success || !data?.plan) {
      return { success: false, error: data?.error || 'A IA não retornou um roteiro válido.' };
    }

    return { success: true, plan: data.plan, liveContext: data.liveContext || null };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      return { success: false, error: 'O planejamento demorou mais que o esperado. Tente novamente.' };
    }
    return { success: false, error: 'Não foi possível conectar ao planejador. Verifique sua conexão.' };
  } finally {
    clearTimeout(timeoutId);
  }
};

export const generateTravelPlan = ({ planRequest, userContext }) =>
  invokeAssistant({ action: 'generate_plan', planRequest, userContext });

// Duas telas podem pedir o mesmo roteiro ao mesmo tempo (retry do usuário, remount).
// A chave é o payload inteiro, então só pedidos idênticos compartilham a chamada em voo.
const invokeAssistant = (payload) => {
  const requestKey = JSON.stringify(payload);
  const activeRequest = activeAssistantRequests.get(requestKey);
  if (activeRequest) return activeRequest;

  const request = executeAssistantRequest(payload).finally(() => {
    if (activeAssistantRequests.get(requestKey) === request) {
      activeAssistantRequests.delete(requestKey);
    }
  });
  activeAssistantRequests.set(requestKey, request);
  return request;
};

export const regeneratePlanActivity = async ({ planRequest, userContext, plan, block }) => {
  return invokeAssistant({
    action: 'regenerate_activity',
    planRequest,
    userContext,
    existingPlan: plan,
    block,
  });
};

export const adjustTravelPlan = async ({ planRequest, userContext, plan, message }) => {
  const adjustment = String(message || '').trim();
  if (!adjustment) {
    return { success: false, error: 'Escreva o que você quer mudar no roteiro.' };
  }

  return invokeAssistant({
    action: 'adjust_plan',
    planRequest,
    userContext,
    existingPlan: plan,
    adjustment,
  });
};
