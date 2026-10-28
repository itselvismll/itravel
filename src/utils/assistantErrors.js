// A mensagem de erro do assistente de viagem, com o código que permite achar a
// falha no log.
//
// POR QUE O CÓDIGO IMPORTA
//
// A Edge Function registra cada falha com `requestId`, `code`, `providerStatus`
// e `providerReason` — tudo o que se precisa para saber se a IA recusou, se
// estourou cota ou se caiu. Mas para o usuário ela devolve uma frase genérica
// ("O planejador está temporariamente indisponível"), porque nenhuma dessas
// informações ajuda quem só queria ajustar o roteiro.
//
// O problema é que a frase genérica também chegava assim para QUEM DEPURA: sem
// o código, achar a requisição correspondente no painel é procurar agulha em
// palheiro. A tela de planejar já mostrava o código; a de ajustar não — e foi
// justamente um erro no ajuste que ficou sem diagnóstico possível.
//
// Módulo puro: recebe o resultado de uma chamada, devolve o texto da tela.

/** Fallback quando nem o requestId chegou: melhor um código inútil do que
 * nenhum, porque a ausência dele é indistinguível de "não houve requisição". */
const randomSuffix = () => Math.random().toString(36).slice(-6);

/**
 * @param {{ error?: string, code?: string, requestId?: string }} failure
 * @param {string} [fallbackMessage] o que dizer quando a função não explicou
 * @returns {string}
 */
export const formatAssistantError = (failure, fallbackMessage = 'Não foi possível falar com o planejador agora. Tente novamente.') => {
  const friendlyMessage = failure?.error || fallbackMessage;

  // Só o fim do requestId: ele é o bastante para localizar no log e cabe numa
  // linha de alerta.
  const shortRequestId = String(failure?.requestId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(-6);

  const safeCode = String(failure?.code || 'PLANNER_UNEXPECTED_ERROR')
    .replace(/[^A-Z0-9_]/gi, '')
    .toUpperCase();

  return `${friendlyMessage}\nCódigo: ${safeCode}-${shortRequestId || randomSuffix()}`;
};
