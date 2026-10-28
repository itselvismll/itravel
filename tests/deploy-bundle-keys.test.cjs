// A checagem compartilhada entre scripts/deploy-web.cjs (pré-deploy, contra o
// dist/ recém-exportado) e scripts/verify-production.cjs (pós-deploy, contra o
// que journi.expo.app está servindo de verdade).
//
// O QUE ESTE TESTE TRAVA
//
// Incidente 1 (15/09/2026): bundle publicado sem NENHUMA `EXPO_PUBLIC_*` —
// `SUPABASE_URL:void 0`. Incidente 2 (06/10/2026): bundle publicado com
// `EXPO_PUBLIC_MAPBOX_TOKEN` presente mas VAZIO — `MAPBOX_TOKEN:''` — porque um
// deploy saiu ao ar por fora de `npm run deploy:web`, que é o único lugar onde
// a checagem pré-deploy roda.
//
// Os dois incidentes têm a mesma raiz técnica: "a variável existe no bundle
// mas não tem valor de verdade". Este teste prova que `findMissingBundleKeys`
// trata os dois casos — ausente (`void 0`) e presente-mas-vazio (`''`) — como
// a MESMA falha, e que um valor de verdade (URL do Supabase, JWT, token pk.
// do Mapbox) é o único jeito de passar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_BUNDLE_KEYS, findMissingBundleKeys } = require('../scripts/lib/requiredBundleKeys.cjs');

const BUNDLE_OK =
  'SUPABASE_URL:"https://qenehyizxesmaeylmcjv.supabase.co",'
  + 'SUPABASE_ANON_KEY:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123",'
  + 'MAPBOX_TOKEN:"pk.eyJ1IjoiZWx2aXNtbGwiLCJhIjoiY210dThmenNlMDJvajJ4cHp4bWdjaGVkcCJ9.fake"';

test('bundle com os três valores de verdade não falta nada', () => {
  assert.deepEqual(findMissingBundleKeys(BUNDLE_OK), []);
});

test('incidente 1: variável AUSENTE do bundle (void 0) é detectada', () => {
  const bundle = BUNDLE_OK.replace('SUPABASE_URL:"https://qenehyizxesmaeylmcjv.supabase.co"', 'SUPABASE_URL:void 0');
  const missing = findMissingBundleKeys(bundle);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, 'EXPO_PUBLIC_SUPABASE_URL');
});

test('incidente 2: variável PRESENTE mas VAZIA (\'\') é detectada do mesmo jeito que ausente', () => {
  // Este é o caso exato do incidente de 06/10/2026: a chave existe no bundle,
  // só não tem valor.
  const bundle = BUNDLE_OK.replace('MAPBOX_TOKEN:"pk.eyJ1IjoiZWx2aXNtbGwiLCJhIjoiY210dThmenNlMDJvajJ4cHp4bWdjaGVkcCJ9.fake"', "MAPBOX_TOKEN:''");
  const missing = findMissingBundleKeys(bundle);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, 'EXPO_PUBLIC_MAPBOX_TOKEN');
});

test('as três chaves faltando ao mesmo tempo (bundle sem nenhum .env lido) são todas detectadas', () => {
  const missing = findMissingBundleKeys('SUPABASE_URL:void 0,SUPABASE_ANON_KEY:void 0,MAPBOX_TOKEN:void 0');
  assert.deepEqual(
    missing.map((entry) => entry.name).sort(),
    REQUIRED_BUNDLE_KEYS.map((entry) => entry.name).sort()
  );
});

test('um token do Mapbox curto demais (menos de 20 caracteres após pk.) ainda falha', () => {
  // Protege contra um valor "presente" mas truncado/corrompido no build —
  // não é só "existe", é "tem o FORMATO de um token real".
  const bundle = BUNDLE_OK.replace(/MAPBOX_TOKEN:"[^"]*"/, 'MAPBOX_TOKEN:"pk.curto"');
  const missing = findMissingBundleKeys(bundle);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].name, 'EXPO_PUBLIC_MAPBOX_TOKEN');
});

test('a lista de chaves obrigatórias é só as três que já quebram o app inteiro ou uma tela inteira', () => {
  assert.deepEqual(
    REQUIRED_BUNDLE_KEYS.map((entry) => entry.name).sort(),
    ['EXPO_PUBLIC_MAPBOX_TOKEN', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_URL']
  );
});
