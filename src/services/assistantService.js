import { supabase } from './supabase';
import { ensurePlanCoordinates } from '../utils/planGeography';

const BASE_ASSISTANT_TIMEOUT_MS = 150000;

export const TRAVEL_INTERESTS = [
  'Cultura', 'Gastronomia', 'Natureza', 'Praia', 'História',
  'Vida noturna', 'Compras', 'Aventura', 'Fotografia', 'Descanso',
];

export const TRAVEL_PACES = [
  { id: 'calm', label: 'Tranquilo' },
  { id: 'balanced', label: 'Equilibrado' },
  { id: 'intense', label: 'Intenso' },
];

const createLocalPreviewPlan = (request) => {
  const days = Array.from({ length: request.duration || 3 }, (_, index) => {
    const date = request.startDate
      ? new Date(`${request.startDate}T12:00:00`)
      : null;
    if (date) date.setDate(date.getDate() + index);
    const destination = request.destination;
    return {
      day: index + 1,
      date: date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '',
      theme: index === 0 ? 'Primeiros encontros com o destino' : `Descobertas pela região ${index + 1}`,
      activities: [
        {
          period: 'Manhã',
          title: `Caminhada de reconhecimento em ${destination}`,
          description: 'Comece com um percurso leve pela região central, observando acessos, transporte e pontos de referência.',
          location: `Centro de ${destination}`,
          duration: '2h30',
          estimatedCost: 0,
          mapQuery: `centro turístico, ${destination}`,
          indoor: false,
          purchaseNote: 'Atividade gratuita. Confirme regras e acesso na ficha do local no Maps.',
        },
        {
          period: 'Tarde',
          title: request.interests?.[0] ? `Experiência de ${request.interests[0].toLowerCase()}` : 'Experiência cultural local',
          description: 'Reserve a tarde para uma atração alinhada aos seus interesses e mantenha uma margem para deslocamentos.',
          location: destination,
          duration: '3h',
          estimatedCost: 80,
          mapQuery: `${request.interests?.[0] || 'atração cultural'}, ${destination}`,
          indoor: true,
          purchaseNote: 'Confira ingressos e o canal oficial na ficha do local no Maps.',
        },
        {
          period: 'Noite',
          title: 'Jantar em uma região bem conectada',
          description: `Escolha uma casa que respeite suas preferências: ${request.foodPreferences || 'culinária local'}.`,
          location: destination,
          duration: '2h',
          estimatedCost: 120,
          mapQuery: `restaurante ${request.foodPreferences || 'comida local'}, ${destination}`,
          indoor: true,
          purchaseNote: 'O valor é uma estimativa de alimentação e pode variar conforme o restaurante.',
        },
      ],
    };
  });
  const dailyBudget = request.budgetLevel === 'economy' ? 300 : request.budgetLevel === 'premium' ? 1200 : 650;
  const requestedBudget = Number(request.budget) || days.length * dailyBudget * (Number(request.travelers) || 1);
  return {
    title: `${days.length} dias em ${request.destination}`,
    summary: 'Prévia local do novo planejador. Após a aprovação, a IA combinará dados atuais com suas preferências para preencher cada atividade.',
    destinationCountry: request.destination,
    localCurrency: request.currency || 'BRL',
    budgetStatus: `Distribuição inicial baseada no teto de ${request.currency || 'BRL'} ${requestedBudget}.`,
    weatherNote: 'A previsão real será carregada pela função de IA quando a nova versão do backend for aprovada.',
    days,
    budget: {
      total: requestedBudget,
      currency: request.currency || 'BRL',
      shoppingIncluded: true,
      scopeNote: 'Inclui hospedagem, alimentação, transporte local, passeios, uma verba para compras e reserva. Passagens de ida e volta não estão incluídas nesta prévia local.',
      items: [
        { category: 'Hospedagem', amount: requestedBudget * 0.38, note: 'Estimativa para todo o período.' },
        { category: 'Alimentação', amount: requestedBudget * 0.24, note: 'Refeições e pequenos lanches.' },
        { category: 'Transporte', amount: requestedBudget * 0.18, note: 'Deslocamentos locais.' },
        { category: 'Passeios e ingressos', amount: requestedBudget * 0.12, note: 'Atividades pagas do roteiro.' },
        { category: 'Compras', amount: requestedBudget * 0.03, note: 'Verba opcional para compras pessoais.' },
        { category: 'Reserva', amount: requestedBudget * 0.05, note: 'Margem para imprevistos.' },
      ],
    },
    checklist: [
      { category: 'Documentos', item: 'Verificar passaporte, vistos e comprovantes', done: false },
      { category: 'Saúde', item: 'Conferir seguro e medicamentos pessoais', done: false },
      { category: 'Dinheiro', item: 'Definir cartões, câmbio e reserva', done: false },
      { category: 'Conectividade', item: 'Planejar internet móvel e mapas offline', done: false },
      { category: 'Bagagem', item: 'Montar mala conforme clima e atividades', done: false },
    ],
    practicalTips: ['Agrupe atrações próximas.', 'Reserve atividades concorridas com antecedência.'],
    safetyTips: ['Confirme regras e alertas em fontes oficiais antes do embarque.'],
    sources: [],
  };
};

const invokeAssistant = async (payload) => {
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

export const generateTravelPlan = async ({ planRequest, userContext }) => {
  const result = await invokeAssistant({ action: 'generate_plan', planRequest, userContext });
  if (!result.success && process.env.NODE_ENV !== 'production') {
    // A prévia local é montada offline e nasce sem coordenada: aqui ela passa pela mesma
    // garantia que a Edge Function aplica, para o roteiro salvo nunca ficar sem pontos.
    return {
      success: true,
      plan: await ensurePlanCoordinates(createLocalPreviewPlan(planRequest), { geocode: true }),
      localPreview: true,
    };
  }
  return result;
};

export const regeneratePlanActivity = async ({ planRequest, userContext, plan, block }) => {
  const result = await invokeAssistant({
    action: 'regenerate_activity',
    planRequest,
    userContext,
    existingPlan: plan,
    block,
  });
  if (!result.success && process.env.NODE_ENV !== 'production') {
    const nextPlan = JSON.parse(JSON.stringify(plan));
    const activity = nextPlan.days?.[block.dayIndex]?.activities?.[block.activityIndex];
    if (activity) {
      activity.title = `Nova sugestão em ${planRequest.destination}`;
      activity.description = 'Alternativa criada na prévia local. A versão aprovada usará a IA para preservar o restante do roteiro e trocar apenas este bloco.';
      activity.location = planRequest.destination;
      activity.mapQuery = `atrações recomendadas, ${planRequest.destination}`;
    }
    return { success: true, plan: nextPlan, localPreview: true };
  }
  return result;
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
