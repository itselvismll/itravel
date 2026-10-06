// O que todo bundle web publicado precisa conter — compartilhado entre a
// checagem PRÉ-deploy (scripts/deploy-web.cjs, contra o `dist/` recém-exportado)
// e a checagem PÓS-deploy (scripts/verify-production.cjs, contra o que
// journi.expo.app está servindo de verdade).
//
// Duas checagens porque são duas perguntas diferentes:
//   PRÉ:  "o build que estou prestes a publicar tem as chaves?"
//   PÓS:  "o que está no ar agora tem as chaves?"
// A primeira existe desde 17/09/2026 (o incidente do Supabase). A segunda
// existe porque ela sozinha não bastou: em 06/10/2026 o globo voltou a mostrar
// países transparentes — `MAPBOX_TOKEN:''` no bundle publicado — e a causa mais
// provável é um deploy rodado por fora deste script (manualmente, com
// `expo export` + `eas deploy` direto), que não passa pela checagem pré-deploy
// porque ela só existe DENTRO do script. A checagem pós-deploy é a rede que
// pega isso mesmo quando alguém pulou a checagem pré-deploy — ou quando o
// build em si fez algo inesperado depois dela.
//
// Cada entrada casa o valor como ele aparece no bundle MINIFICADO — é o que dá
// para verificar de fora, sem rodar o app. Vazio (`MAPBOX_TOKEN:""` ou
// `MAPBOX_TOKEN:void 0`) nunca casa um destes padrões: todos exigem o FORMATO
// real do valor (URL do Supabase, JWT começando em "ey", token do Mapbox
// começando em "pk." com pelo menos 20 caracteres) — "variável vazia" e
// "variável ausente" são o MESMO caso aqui, de propósito, porque os dois
// quebram o app do mesmo jeito.
const REQUIRED_BUNDLE_KEYS = [
  { name: 'EXPO_PUBLIC_SUPABASE_URL', pattern: /SUPABASE_URL:"https:\/\/[a-z0-9]+\.supabase\.co"/ },
  { name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', pattern: /SUPABASE_ANON_KEY:"ey[A-Za-z0-9._-]{20,}"/ },
  { name: 'EXPO_PUBLIC_MAPBOX_TOKEN', pattern: /MAPBOX_TOKEN:"pk\.[A-Za-z0-9._-]{20,}"/ },
];

/**
 * @param {string} bundleSource todo o JS do bundle, concatenado
 * @returns {Array<{name: string, pattern: RegExp}>} as entradas que NÃO bateram
 */
const findMissingBundleKeys = (bundleSource) =>
  REQUIRED_BUNDLE_KEYS.filter((entry) => !entry.pattern.test(bundleSource));

module.exports = { REQUIRED_BUNDLE_KEYS, findMissingBundleKeys };
