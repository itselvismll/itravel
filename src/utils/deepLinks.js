// De uma URL que o sistema entregou ao app para um destino de navegacao.
//
// Modulo PURO — sem `expo-linking`, sem navigationRef, sem React. Quem escuta o
// sistema operacional e quem navega e o AppNavigator; aqui fica a DECISAO, que e
// a parte que da para errar em silencio e que um teste sem app consegue afirmar.
//
// POR QUE ISTO NAO ESTA DENTRO DO AppNavigator
//
// Porque o erro tipico do deep link nao aparece no desenvolvimento. O link chega
// certo no navegador, e chega diferente no Android (o sistema pode entregar a URL
// com o scheme trocado, com barra no fim, ou em maiuscula) — e o que acontece
// quando nao casa e NADA: o app abre na tela inicial, como se o link nao
// existisse. Ninguem reporta "abriu no lugar errado", reportam "o convite nao
// funciona", que e muito mais dificil de rastrear.
import { parseInviteLink } from './inviteLink';

/**
 * O destino de uma URL, ou null se ela nao e nossa.
 *
 * Devolver null e uma resposta legitima e frequente: o Expo entrega a esta
 * funcao TODA url que abre o app, incluindo a de retorno do login social e a do
 * proprio `exp://` no desenvolvimento. Tratar o desconhecido como erro encheria
 * o log de ruido; o certo e ignorar em silencio e deixar o app abrir onde abriria.
 *
 * @param {string | null | undefined} url
 * @returns {{ name: string, params: Record<string, unknown> } | null}
 */
export const routeForUrl = (url) => {
  const token = parseInviteLink(url);
  if (token) return { name: 'TripInvite', params: { token } };

  return null;
};

/**
 * Esta URL e um convite de viagem?
 *
 * Atalho de leitura para quem so precisa do sim/nao — a tela de login usa para
 * decidir se guarda a URL e volta a ela depois de a pessoa entrar.
 *
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export const isInviteUrl = (url) => routeForUrl(url)?.name === 'TripInvite';
