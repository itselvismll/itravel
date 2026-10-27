// Trava mecânica da CAMADA 1 do deploy: scripts/check-build-env.cjs.
//
// POR QUE ESTE TESTE EXISTE
//
// A classificação obrigatória/opcional em check-build-env.cjs é uma decisão
// escrita em duas listas soltas. Sem um teste comparando essas listas contra
// `.env.example`, uma variável nova nasceria ali sem que ninguém precisasse
// decidir se o deploy deve falhar sem ela — exatamente o tipo de lacuna que já
// custou três incidentes de produção (ver AGENTS.md, seção de deploy).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  REQUIRED_ENV_VARS,
  OPTIONAL_ENV_VARS,
  declaredExpoPublicVars,
  checkBuildEnv,
} = require('../scripts/check-build-env.cjs');

const root = path.resolve(__dirname, '..');
const envExampleSource = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

test('as três variáveis que já quebraram produção são obrigatórias', () => {
  assert.deepEqual(
    [...REQUIRED_ENV_VARS].sort(),
    ['EXPO_PUBLIC_MAPBOX_TOKEN', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_URL']
  );
});

test('toda EXPO_PUBLIC_* de .env.example está classificada (obrigatória ou opcional)', () => {
  // A catraca: uma variável nova em .env.example nasce FORA das duas listas,
  // e é isto que falha aqui -- obrigando quem a acrescentou a decidir, em vez
  // de ela ficar de fora da checagem em silêncio.
  const declared = declaredExpoPublicVars(envExampleSource);
  const classified = new Set([...REQUIRED_ENV_VARS, ...OPTIONAL_ENV_VARS]);
  const semDono = declared.filter((name) => !classified.has(name));
  assert.deepEqual(semDono, [], `declaradas em .env.example sem classificação: ${semDono.join(', ')}`);
});

test('nenhuma variável está nas duas listas ao mesmo tempo', () => {
  const emAmbas = REQUIRED_ENV_VARS.filter((name) => OPTIONAL_ENV_VARS.includes(name));
  assert.deepEqual(emAmbas, []);
});

test('ambiente com as três obrigatórias preenchidas não falta nada', () => {
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://qenehyizxesmaeylmcjv.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.abc123',
    EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.eyJ1IjoiZWx2aXNtbGwifQ.fake',
  };
  const { missing } = checkBuildEnv({ env, envExampleSource });
  assert.deepEqual(missing, []);
});

test('reprodução exata do incidente de 27/10/2026: MAPBOX_TOKEN vazio falha, nomeando a variável', () => {
  // O caso real: a variável existe nas outras duas, só o Mapbox ficou de fora
  // do .env daquela máquina.
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://qenehyizxesmaeylmcjv.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.abc123',
    EXPO_PUBLIC_MAPBOX_TOKEN: '',
  };
  const { missing } = checkBuildEnv({ env, envExampleSource });
  assert.deepEqual(missing, ['EXPO_PUBLIC_MAPBOX_TOKEN']);
});

test('ambiente totalmente vazio falha nomeando as três obrigatórias', () => {
  const { missing } = checkBuildEnv({ env: {}, envExampleSource });
  assert.deepEqual(
    [...missing].sort(),
    ['EXPO_PUBLIC_MAPBOX_TOKEN', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_URL']
  );
});

test('variável opcional ausente não entra em `missing`', () => {
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://qenehyizxesmaeylmcjv.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.abc123',
    EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.eyJ1IjoiZWx2aXNtbGwifQ.fake',
    // EXPO_PUBLIC_STADIA_API_KEY de propósito ausente: é opcional.
  };
  const { missing } = checkBuildEnv({ env, envExampleSource });
  assert.deepEqual(missing, []);
});
