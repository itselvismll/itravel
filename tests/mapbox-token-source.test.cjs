// Cobre scripts/lib/verifyMapboxTokenSource.cjs -- a camada PÓS-export que
// scripts/deploy-web.cjs chama contra o bundle recém-gerado, comparando o
// token embutido por IDENTIDADE (não só formato) com o de `.env`.
//
// `tests/deploy-bundle-keys.test.cjs` já cobre que findMissingBundleKeys trata
// um token qualquer com formato `pk.*` como presente -- este arquivo cobre o
// caso que aquele, de propósito, não resolve: dois tokens diferentes, os dois
// com formato válido, só um deles pode ir para produção.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractBundleMapboxToken,
  verifyMapboxTokenSource,
} = require('../scripts/lib/verifyMapboxTokenSource.cjs');

const RESTRICTED_TOKEN = 'pk.eyJ1IjoiZWx2aXNtbGwiLCJhIjoicmVzdHJpdG8ifQ.producao';
const UNRESTRICTED_TOKEN = 'pk.eyJ1IjoiZWx2aXNtbGwiLCJhIjoic2VtcmVzdHJpY2FvIn0.dev';

const bundleWithToken = (token) => `coisa();MAPBOX_TOKEN:"${token}";outraCoisa()`;

test('extractBundleMapboxToken recupera o token de verdade, não só confirma o formato', () => {
  assert.equal(extractBundleMapboxToken(bundleWithToken(RESTRICTED_TOKEN)), RESTRICTED_TOKEN);
  assert.equal(extractBundleMapboxToken(bundleWithToken(UNRESTRICTED_TOKEN)), UNRESTRICTED_TOKEN);
});

test('extractBundleMapboxToken devolve null sem token no formato certo', () => {
  assert.equal(extractBundleMapboxToken('MAPBOX_TOKEN:void 0'), null);
  assert.equal(extractBundleMapboxToken('MAPBOX_TOKEN:""'), null);
});

test('bundle com o token de produção (igual a .env) passa', () => {
  const result = verifyMapboxTokenSource({
    bundleSource: bundleWithToken(RESTRICTED_TOKEN),
    productionToken: RESTRICTED_TOKEN,
  });
  assert.deepEqual(result, { ok: true });
});

test('reprodução exata do vazamento: bundle com o token de .env.local (sem restrição) falha', () => {
  // O caso real: o export pegou o token sem restrição de `.env.local` em vez
  // do restrito de `.env` -- os dois batem o formato, só a identidade importa.
  const result = verifyMapboxTokenSource({
    bundleSource: bundleWithToken(UNRESTRICTED_TOKEN),
    productionToken: RESTRICTED_TOKEN,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'token-divergente');
  assert.equal(result.bundleToken, UNRESTRICTED_TOKEN);
  assert.equal(result.productionToken, RESTRICTED_TOKEN);
});

test('bundle sem nenhum token no formato certo não é tratado como "divergente"', () => {
  // Isto já é pego por `findMissingBundleKeys` (chave ausente) -- esta função
  // não deve reclassificar o mesmo problema com uma mensagem diferente.
  const result = verifyMapboxTokenSource({
    bundleSource: 'MAPBOX_TOKEN:void 0',
    productionToken: RESTRICTED_TOKEN,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bundle-sem-token');
});

test('sem token de produção para comparar (.env não tem a variável), não é tratado como "divergente"', () => {
  const result = verifyMapboxTokenSource({
    bundleSource: bundleWithToken(UNRESTRICTED_TOKEN),
    productionToken: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'env-sem-token');
});
