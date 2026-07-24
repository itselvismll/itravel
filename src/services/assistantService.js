import { supabase } from './supabase';

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
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'Sua sessão expirou. Entre novamente para usar o assistente.' };
    }

    const { data, error } = await supabase.functions.invoke(
      'travel-assistant',
      {
        body: { promptType, destination, userContext },
        headers: { Authorization: `Bearer ${session.access_token}` },
      }
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
  } catch {
    return {
      success: false,
      error: 'Não foi possível conectar ao assistente. Tente novamente.',
    };
  }
};
