// Confere que o token do Mapbox embutido no bundle de produção é o token
// RESTRITO de `.env` — não o token sem restrição de `.env.local`.
//
// POR QUE ISTO NÃO É A MESMA COISA QUE `requiredBundleKeys.cjs`
//
// `findMissingBundleKeys` só prova que EXISTE um token com o formato certo no
// bundle — `pk.` seguido de pelo menos 20 caracteres. Um token do Mapbox
// qualquer, de QUALQUER conta, passa nessa checagem. Isso não pega o modo de
// falha deste arquivo: os DOIS tokens documentados em `.env.example` têm o
// formato `pk.*` igualmente válido —
//
//   • `.env`       — token RESTRITO a journi.expo.app. É o único que pode
//                     ir para produção.
//   • `.env.local` — token SEM restrição de URL, para desenvolver em
//                     localhost (onde o token restrito responde 403).
//
// O Expo sobrepõe `.env` com `.env.local` sempre que o arquivo existe —
// inclusive num `expo export --platform web` rodado para publicar produção.
// Se isso acontecer, o build sai PERFEITO: todas as chaves presentes, globo
// com satélite, roteiro funcionando. O problema é só visível para quem souber
// comparar os dois tokens — e o custo é o token sem restrição exposto no
// bundle público, pronto para qualquer site do mundo queimar a cota da conta.
//
// POR QUE NÃO HARDCODAR O TOKEN ESPERADO AQUI
//
// Nenhum token do Mapbox — nem o `pk.*` "público" — pode ir para o
// repositório; o push protection do GitHub recusa (ver `.env.example`). Este
// módulo nunca lê um valor fixo: ele lê `.env` em tempo de execução, na
// máquina de quem está publicando, e só então compara.
const { readEnvFile } = require('./readEnvFile.cjs');

// Mesmo padrão de `requiredBundleKeys.cjs`, com um grupo de captura para
// recuperar o valor que de fato foi embutido, não só confirmar que bate.
const MAPBOX_TOKEN_IN_BUNDLE = /MAPBOX_TOKEN:"(pk\.[A-Za-z0-9._-]{20,})"/;

/**
 * @param {string} bundleSource todo o JS do bundle, concatenado
 * @returns {string | null} o token embutido, ou null se nenhum bateu o formato
 */
const extractBundleMapboxToken = (bundleSource) => (
  bundleSource.match(MAPBOX_TOKEN_IN_BUNDLE)?.[1] || null
);

/**
 * @param {string} root raiz do projeto
 * @returns {string | null} o token de PRODUÇÃO declarado em `.env` — nunca
 *   `.env.local`, de propósito: é o que `expo export` deveria ter lido.
 */
const readProductionMapboxToken = (root) => (
  readEnvFile(root, '.env').EXPO_PUBLIC_MAPBOX_TOKEN || null
);

/**
 * @param {{ bundleSource: string, productionToken: string | null }} input
 * @returns {{ ok: true } | { ok: false, reason: 'bundle-sem-token' | 'env-sem-token' | 'token-divergente', bundleToken: string | null, productionToken: string | null }}
 */
const verifyMapboxTokenSource = ({ bundleSource, productionToken }) => {
  const bundleToken = extractBundleMapboxToken(bundleSource);

  // Token ausente/malformado no bundle já é pego por `findMissingBundleKeys`
  // — aqui só evitamos comparar `null` com `null` e dar falso OK.
  if (!bundleToken) return { ok: false, reason: 'bundle-sem-token', bundleToken, productionToken };

  // `.env` sem o token é uma máquina mal configurada para publicar produção,
  // não o vazamento que este módulo existe para pegar — mas também não é um
  // "ok", porque não dá para confirmar a origem do que foi embutido.
  if (!productionToken) return { ok: false, reason: 'env-sem-token', bundleToken, productionToken };

  if (bundleToken !== productionToken) {
    return { ok: false, reason: 'token-divergente', bundleToken, productionToken };
  }

  return { ok: true };
};

module.exports = {
  MAPBOX_TOKEN_IN_BUNDLE,
  extractBundleMapboxToken,
  readProductionMapboxToken,
  verifyMapboxTokenSource,
};
