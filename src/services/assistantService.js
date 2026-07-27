import { supabase } from './supabase';

const ASSISTANT_TIMEOUT_MS = 45000;

export const PROMPT_TYPES = [
  { id: 'guide',     emoji: '📋', title: 'Guia Completo',
    description: 'Tudo sobre o destino em 1 página',     color: '#6C2BD9' },
  { id: 'itinerary', emoji: '🗺️', title: 'Experiências Locais',
    description: 'Joias escondidas e autênticas',         color: '#FF4D6D' },
  { id: 'budget',    emoji: '💰', title: 'Otimizar Orçamento',
    description: 'Economize sem perder experiência',      color: '#FF9A00' },
  { id: 'weather',   emoji: '🌤️', title: 'Roteiro por Clima',
    description: 'Planos para sol e para chuva',          color: '#00D1C1' },
  { id: 'scams',     emoji: '🛡️', title: 'Evitar Golpes',
    description: 'O que tomar cuidado no destino',        color: '#FF4D6D' },
  { id: 'summary',   emoji: '✅', title: 'Resumo de Viagem',
    description: 'Checklist e dicas essenciais',          color: '#6C2BD9' },
];

export const askTravelAssistant = async ({ promptType, destination, userContext }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT_MS);

  try {
    let { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      const refreshResult = await supabase.auth.refreshSession();
      session = refreshResult.data.session;
    }

    if (!session?.access_token) {
      return { success: false, error: 'Sua sessão expirou. Entre novamente para usar o assistente.' };
    }

    const { data, error } = await supabase.functions.invoke(
      'travel-assistant',
      {
        body: { promptType, destination, userContext },
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      }
    );

    if (controller.signal.aborted) {
      return {
        success: false,
        error: 'A resposta demorou mais que o esperado. Tente novamente.',
      };
    }

    if (error) {
      let functionError;
      try {
        functionError = await error.context?.json();
      } catch {
        functionError = null;
      }
      return {
        success: false,
        error: functionError?.error || 'O assistente está temporariamente indisponível.',
      };
    }

    if (!data?.success || !data?.response) {
      return {
        success: false,
        error: data?.error || 'O assistente não retornou uma resposta válida.',
      };
    }

    return { success: true, response: data.response };
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      return {
        success: false,
        error: 'A resposta demorou mais que o esperado. Tente novamente.',
      };
    }

    return {
      success: false,
      error: 'Não foi possível conectar ao assistente. Tente novamente.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
};
