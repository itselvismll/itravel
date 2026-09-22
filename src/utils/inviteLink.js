// O link de convite: como ele é montado e como é lido de volta.
//
// Módulo puro — sem `expo-linking`, sem navegação, sem rede. Quem monta a URL de
// verdade (com o scheme resolvido pelo ambiente) é quem chama; aqui ficam o
// FORMATO e a leitura, que é a parte que dá para errar em silêncio e que um
// teste sem app consegue afirmar.
//
// DUAS FORMAS DO MESMO CONVITE, E POR QUÊ
//
//   journi://trip-invite/<token>          — abre o app direto, quando instalado
//   https://journi.expo.app/trip-invite/<token>  — abre no navegador
//
// O link compartilhado é o HTTPS, sempre. Não porque seja melhor, mas porque um
// `journi://` colado numa conversa é texto morto para quem não tem o app: não
// vira link clicável, e quem clica não vai a lugar nenhum. O https abre a versão
// web, que funciona, e num aparelho com o app instalado o sistema oferece abrir
// no app. O scheme continua existindo para o retorno depois do login.
//
// O TOKEN NÃO VAI EM QUERY STRING, vai no caminho. Query string se perde em
// redirecionamento, encurtador e pré-visualização de conversa mais facilmente do
// que segmento de caminho — e o token é a credencial: perdê-lo no meio do
// caminho transforma "entrar na viagem" em "link inválido".

/** O caminho do convite, compartilhado pelas duas formas. */
export const INVITE_PATH = 'trip-invite';

/** De onde o link público sai. O mesmo domínio que o `npm run deploy:web` publica. */
export const INVITE_WEB_ORIGIN = 'https://journi.expo.app';

/**
 * O token é 32 caracteres hex, como `trip_invites.token` gera
 * (`replace(gen_random_uuid()::text, '-', '')`).
 *
 * A validação existe para o app não gastar uma ida ao banco com lixo colado da
 * área de transferência — e para `parseInviteLink` poder dizer "isto não é um
 * convite" em vez de devolver meio token.
 */
const TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * @param {unknown} token
 * @returns {boolean}
 */
export const isValidInviteToken = (token) =>
  typeof token === 'string' && TOKEN_PATTERN.test(token.trim());

/**
 * O link para compartilhar com uma pessoa.
 *
 * @param {string} token
 * @param {{ origin?: string }} [options]
 * @returns {string | null} a URL, ou null se o token não é um token
 */
export const buildInviteUrl = (token, { origin = INVITE_WEB_ORIGIN } = {}) => {
  if (!isValidInviteToken(token)) return null;
  const base = String(origin).replace(/\/+$/, '');
  return `${base}/${INVITE_PATH}/${String(token).trim().toLowerCase()}`;
};

/**
 * O texto que acompanha o link quando a pessoa compartilha.
 *
 * Fica aqui, e não na tela, porque é conteúdo: a mensagem precisa dizer de qual
 * viagem se trata e que é preciso ter conta — senão quem recebe abre, cai numa
 * tela de login e não entende por quê.
 *
 * @param {{ tripTitle?: string, token: string, origin?: string }} params
 * @returns {{ message: string, url: string } | null}
 */
export const buildInviteShare = ({ tripTitle, token, origin }) => {
  const url = buildInviteUrl(token, { origin });
  if (!url) return null;

  const nome = typeof tripTitle === 'string' && tripTitle.trim()
    ? tripTitle.trim()
    : 'uma viagem';

  return {
    url,
    message: `Quero te levar em ${nome} no Journi. Abra o link para entrar no roteiro `
      + `(é preciso ter uma conta): ${url}`,
  };
};

/**
 * O token dentro de uma URL de convite, em qualquer das duas formas.
 *
 * Aceita as duas porque as duas chegam: o https vem do link compartilhado, e o
 * `journi://` vem do retorno depois do login. Aceita também maiúsculas e barra
 * no fim, porque aplicativo de conversa mexe na URL antes de entregar.
 *
 * @param {string | null | undefined} url
 * @returns {string | null} o token em minúsculas, ou null se não é um convite
 */
export const parseInviteLink = (url) => {
  if (typeof url !== 'string' || !url.trim()) return null;

  // Sem `new URL`: o scheme customizado (`journi://trip-invite/abc`) é parseado de
  // formas diferentes em cada plataforma — no navegador o host some, no Node ele
  // vira o primeiro segmento. Procurar o segmento diretamente vale nas duas.
  // O `(?![0-9a-fA-F])` no fim é o que impede um caminho com 34 caracteres hex
  // de casar os 32 primeiros e virar um token DIFERENTE do que estava escrito.
  // Sem ele, uma URL corrompida no meio do caminho não seria recusada: ela
  // levaria a pessoa à tela do convite com um token inventado, e o erro sairia
  // como "este convite não é mais válido" — culpando o convite em vez da URL.
  // A barra do fim continua passando, porque `/` não é hex.
  const match = new RegExp(
    `(?:^|[/?&#]|://)${INVITE_PATH}/([0-9a-fA-F]{32})(?![0-9a-fA-F])`
  ).exec(url.trim());
  if (!match) return null;

  return match[1].toLowerCase();
};
