import { supabase } from './supabase';

const BASE_ASSISTANT_TIMEOUT_MS = 150000;
const ACTIVITY_REGENERATION_TIMEOUT_MS = 60000;
export const ASSISTANT_PLANNER_VERSION = 2;
const activeAssistantRequests = new Map();

const awaitWithDeadline = (promise, deadlineAt, controller) => new Promise((resolve, reject) => {
  let settled = false;
  const remainingMs = Math.max(0, deadlineAt - Date.now());
  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    controller.abort();
    const timeoutError = new Error('Assistant request timed out');
    timeoutError.name = 'AbortError';
    reject(timeoutError);
  }, remainingMs);

  Promise.resolve(promise).then(
    value => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    },
    error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    },
  );
});

export const createAssistantRequestId = () => (
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(-12)
);

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
  const requestId = createAssistantRequestId();
  const requestedDuration = Number(payload?.planRequest?.duration) || 3;
  const timeoutMs = payload?.action === 'regenerate_activity'
    ? ACTIVITY_REGENERATION_TIMEOUT_MS
    : Math.min(300000, Math.max(BASE_ASSISTANT_TIMEOUT_MS, requestedDuration * 10000));
  const deadlineAt = Date.now() + timeoutMs;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let { data: { session } } = await awaitWithDeadline(
      supabase.auth.getSession(),
      deadlineAt,
      controller,
    );

    if (!session?.access_token) {
      const refreshResult = await awaitWithDeadline(
        supabase.auth.refreshSession(),
        deadlineAt,
        controller,
      );
      session = refreshResult.data.session;
    }

    if (!session?.access_token) {
      return {
        success: false,
        error: 'Sua sessão expirou. Entre novamente para usar o planejador.',
        code: 'AUTH_SESSION_EXPIRED',
        requestId,
      };
    }

    const { data, error } = await awaitWithDeadline(
      supabase.functions.invoke('travel-assistant', {
        body: payload,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'x-journi-request-id': requestId,
        },
        signal: controller.signal,
      }),
      deadlineAt,
      controller,
    );

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
        code: functionError?.code || 'ASSISTANT_FUNCTION_ERROR',
        requestId: functionError?.requestId || requestId,
        retryAfterSeconds: functionError?.retryAfterSeconds,
        providerStatus: functionError?.providerStatus,
        providerReason: functionError?.providerReason,
        providerHttpStatus: functionError?.providerHttpStatus || error.context?.status,
      };
    }

    if (!data?.success || !data?.plan) {
      return {
        success: false,
        error: data?.error || 'A IA não retornou um roteiro válido.',
        code: data?.code || 'AI_INVALID_RESPONSE',
        requestId: data?.requestId || requestId,
        retryAfterSeconds: data?.retryAfterSeconds,
        providerStatus: data?.providerStatus,
        providerReason: data?.providerReason,
        providerHttpStatus: data?.providerHttpStatus,
      };
    }

    if (
      payload?.action === 'generate_plan'
      && Number(data?.plannerVersion) !== ASSISTANT_PLANNER_VERSION
    ) {
      return {
        success: false,
        error: 'O planejador local e o serviço de IA estão em versões diferentes. Atualize a função antes de testar novamente.',
        code: 'BACKEND_VERSION_MISMATCH',
        requestId: data?.requestId || requestId,
      };
    }

    if (payload?.action === 'generate_plan') {
      const budgetError = validateGeneratedBudget(data.plan, payload.planRequest);
      if (budgetError) {
        return {
          success: false,
          ...budgetError,
          requestId: data.requestId || requestId,
        };
      }
    }

    return {
      success: true,
      plan: data.plan,
      liveContext: data.liveContext || null,
      requestId: data.requestId || requestId,
    };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      return {
        success: false,
        error: 'O planejamento demorou mais que o esperado. Tente novamente.',
        code: 'AI_REQUEST_TIMEOUT',
        requestId,
      };
    }
    return {
      success: false,
      error: 'Não foi possível conectar ao planejador. Verifique sua conexão.',
      code: 'AI_REQUEST_NETWORK_ERROR',
      requestId,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeBudgetCategory = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const getBudgetCategoryAmount = (plan, pattern) => (
  (plan?.budget?.items || []).reduce((total, item) => (
    pattern.test(normalizeBudgetCategory(item?.category))
      ? total + (Number(item?.amount) || 0)
      : total
  ), 0)
);

const validateGeneratedBudget = (plan, planRequest) => {
  const missing = [];
  if (getBudgetCategoryAmount(plan, /passag|voo/) <= 0) missing.push('passagens');
  if (Number(planRequest?.duration) > 1 && getBudgetCategoryAmount(plan, /hosped|hotel/) <= 0) {
    missing.push('hospedagem');
  }
  if (!missing.length) return null;
  return {
    code: 'AI_INCOMPLETE_BUDGET',
    error: `A IA não encontrou uma estimativa válida para ${missing.join(' e ')}. Tente novamente para pesquisarmos novas cotações.`,
  };
};

export const generateTravelPlan = async ({ planRequest, userContext }) => {
  return invokeAssistant({
    action: 'generate_plan',
    requiredPlannerVersion: ASSISTANT_PLANNER_VERSION,
    planRequest: {
      ...planRequest,
      requiredPlannerVersion: ASSISTANT_PLANNER_VERSION,
    },
    userContext,
  });
};

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
