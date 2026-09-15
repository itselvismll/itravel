import { supabase } from './supabase';

const BASE_ASSISTANT_TIMEOUT_MS = 150000;
const MAX_DAYS_PER_ASSISTANT_REQUEST = 12;
const activeAssistantRequests = new Map();

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
  const timeoutMs = Math.min(300000, Math.max(BASE_ASSISTANT_TIMEOUT_MS, requestedDuration * 10000));
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const refreshResult = await supabase.auth.refreshSession();
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

    const { data, error } = await supabase.functions.invoke('travel-assistant', {
      body: payload,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'x-journi-request-id': requestId,
      },
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

const addIsoDays = (value, days) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const mergeUnique = (items, keyForItem = (item) => String(item || '')) => (
  [...new Map(items.filter(Boolean).map(item => [keyForItem(item), item])).values()]
);

const buildPlanSegments = (planRequest) => {
  const duration = Math.max(1, Math.floor(Number(planRequest?.duration) || 1));
  const destinations = Array.isArray(planRequest?.destinations)
    ? planRequest.destinations.filter(item => item?.name)
    : [];
  const destinationCount = Math.max(1, destinations.length);
  const destinationForDay = Array.from({ length: duration }, (_, dayIndex) => Math.min(
    destinationCount - 1,
    Math.floor(dayIndex * destinationCount / duration),
  ));
  const totalDaysByDestination = destinationForDay.reduce((counts, destinationIndex) => {
    counts[destinationIndex] = (counts[destinationIndex] || 0) + 1;
    return counts;
  }, {});

  return Array.from({ length: Math.ceil(duration / MAX_DAYS_PER_ASSISTANT_REQUEST) }, (_, index) => {
    const dayOffset = index * MAX_DAYS_PER_ASSISTANT_REQUEST;
    const segmentDuration = Math.min(MAX_DAYS_PER_ASSISTANT_REQUEST, duration - dayOffset);
    const segmentDestinationIndices = destinationForDay.slice(dayOffset, dayOffset + segmentDuration);
    const uniqueDestinationIndices = [...new Set(segmentDestinationIndices)];
    const segmentDestinations = destinations.length
      ? uniqueDestinationIndices.map(destinationIndex => destinations[destinationIndex]).filter(Boolean)
      : [];
    const segmentDaysByDestination = segmentDestinationIndices.reduce((counts, destinationIndex) => {
      counts[destinationIndex] = (counts[destinationIndex] || 0) + 1;
      return counts;
    }, {});
    const segmentBudgets = (planRequest.destinationBudgets || [])
      .map((item) => {
        const destinationIndex = destinations.findIndex(destination => (
          (item.countryCode && destination.code === item.countryCode)
          || destination.name === item.countryName
        ));
        if (!uniqueDestinationIndices.includes(destinationIndex)) return null;
        const ratio = (segmentDaysByDestination[destinationIndex] || 0)
          / Math.max(1, totalDaysByDestination[destinationIndex] || 0);
        return {
          ...item,
          amount: (Number(item.amount) || 0) * ratio,
          localAmount: (Number(item.localAmount) || 0) * ratio,
          amountInBRL: (Number(item.amountInBRL) || 0) * ratio,
        };
      })
      .filter(Boolean);
    const startDate = addIsoDays(planRequest.startDate, dayOffset);

    return {
      dayOffset,
      duration: segmentDuration,
      request: {
        ...planRequest,
        origin: dayOffset === 0
          ? planRequest.origin
          : destinations[destinationForDay[dayOffset - 1]]?.name || planRequest.origin,
        destination: segmentDestinations.map(item => item.name).join(', ') || planRequest.destination,
        destinations: segmentDestinations,
        preferredPlaces: segmentDestinations.map(item => item.name).join(', ') || planRequest.preferredPlaces,
        duration: segmentDuration,
        startDate,
        endDate: startDate ? addIsoDays(startDate, segmentDuration - 1) : '',
        budget: (Number(planRequest.budget) || 0) * (segmentDuration / duration),
        destinationBudgets: segmentBudgets,
        notes: [
          planRequest.notes,
          `Trecho ${index + 1} de ${Math.ceil(duration / MAX_DAYS_PER_ASSISTANT_REQUEST)} do roteiro completo.`,
        ].filter(Boolean).join(' '),
      },
    };
  });
};

const mergeSegmentResults = (results, planRequest) => {
  const first = results[0];
  const plan = { ...first.plan };
  plan.title = `${planRequest.duration} dias em ${planRequest.destination}`;
  plan.summary = `Roteiro completo de ${planRequest.duration} dias, organizado por regiões e deslocamentos entre os destinos.`;
  plan.days = results.flatMap(({ plan: segmentPlan, dayOffset }) => (
    (segmentPlan.days || []).map((day, index) => ({
      ...day,
      day: dayOffset + index + 1,
      date: addIsoDays(planRequest.startDate, dayOffset + index) || day.date,
    }))
  ));

  const budgetItems = new Map();
  results.forEach(({ plan: segmentPlan }) => {
    (segmentPlan.budget?.items || []).forEach((item) => {
      const current = budgetItems.get(item.category) || { ...item, amount: 0 };
      current.amount += Number(item.amount) || 0;
      if (!current.note && item.note) current.note = item.note;
      budgetItems.set(item.category, current);
    });
  });
  const items = [...budgetItems.values()].map(item => ({
    ...item,
    amount: Math.round(item.amount * 100) / 100,
  }));
  plan.budget = {
    ...plan.budget,
    items,
    total: Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
    shoppingIncluded: items.some(item => item.category === 'Compras' && item.amount > 0),
    scopeNote: `Estimativa consolidada para os ${planRequest.duration} dias da viagem.`,
  };
  plan.checklist = mergeUnique(
    results.flatMap(result => result.plan.checklist || []),
    item => `${item.category}:${item.item}`,
  );
  plan.safetyTips = mergeUnique(results.flatMap(result => result.plan.safetyTips || []));
  plan.practicalTips = mergeUnique(results.flatMap(result => result.plan.practicalTips || []));
  plan.sources = mergeUnique(
    results.flatMap(result => result.plan.sources || []),
    item => item.url || item.label,
  );

  const liveContexts = results.map(result => result.liveContext).filter(Boolean);
  return {
    success: true,
    plan,
    liveContext: liveContexts.length ? {
      ...liveContexts[0],
      destinations: mergeUnique(liveContexts.flatMap(item => item.destinations || []), item => item.requestedDestination),
      realPlaces: mergeUnique(liveContexts.flatMap(item => item.realPlaces || []), item => item.placeId || `${item.name}:${item.latitude}:${item.longitude}`),
      sources: mergeUnique(liveContexts.flatMap(item => item.sources || []), item => item.url || item.label),
      retrievedAt: liveContexts[liveContexts.length - 1].retrievedAt,
    } : null,
    requestId: results.map(result => result.requestId).filter(Boolean).join(','),
  };
};

export const generateTravelPlan = async ({ planRequest, userContext }) => {
  const segments = buildPlanSegments(planRequest);
  if (segments.length === 1) {
    return invokeAssistant({ action: 'generate_plan', planRequest, userContext });
  }

  const results = [];
  for (const segment of segments) {
    const result = await invokeAssistant({
      action: 'generate_plan',
      planRequest: segment.request,
      userContext,
    });
    if (!result.success) return result;
    results.push({ ...result, dayOffset: segment.dayOffset });
  }
  return mergeSegmentResults(results, planRequest);
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
