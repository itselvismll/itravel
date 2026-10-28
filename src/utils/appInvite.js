// O convite para o app inteiro — não para uma viagem.
//
// Irmão de `inviteLink.js`, e separado dele de propósito: lá o link carrega um
// token que dá acesso a UMA viagem, com validação, resgate e tela própria. Aqui
// não há token nenhum. É só o endereço do app mais uma frase, e misturar as duas
// coisas no mesmo módulo faria parecer que este convite também precisa ser
// gerado no banco.
//
// Módulo puro — sem `Share`, sem clipboard, sem React. Quem compartilha de fato
// é a tela; aqui mora o TEXTO, que é conteúdo e é o que dá para afirmar num
// teste sem app.

/** De onde o app é servido. O mesmo domínio que o `npm run deploy:web` publica. */
export const APP_WEB_ORIGIN = 'https://journi.expo.app';

/**
 * A mensagem que acompanha o link quando alguém convida um amigo para o app.
 *
 * O link vai TAMBÉM dentro da mensagem, e não só no campo `url`: no Android o
 * `Share` do React Native ignora `url` em vários aplicativos de conversa, e o
 * convite chegaria sem endereço nenhum. Repetido, o pior caso é o link aparecer
 * duas vezes; sem isso, o pior caso é um convite que não leva a lugar algum.
 *
 * @param {{ username?: string | null, origin?: string }} [params]
 * @returns {{ message: string, url: string }}
 */
export const buildAppInviteShare = ({ username, origin = APP_WEB_ORIGIN } = {}) => {
  const url = String(origin).replace(/\/+$/, '');
  const handle = typeof username === 'string' && username.trim()
    ? `@${username.trim()}`
    : null;

  // Com handle a frase ganha um remetente ("me acha por @fulano"), que é o que
  // transforma um link solto em convite de alguém. Sem handle — perfil ainda sem
  // username — a frase precisa continuar de pé sozinha.
  const message = handle
    ? `Estou usando o Journi para registrar minhas viagens e planejar as próximas. `
      + `Vem comigo — me acha por ${handle}: ${url}`
    : `Estou usando o Journi para registrar minhas viagens e planejar as próximas. `
      + `Vem comigo: ${url}`;

  return { url, message };
};
