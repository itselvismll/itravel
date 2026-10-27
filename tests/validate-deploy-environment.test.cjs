// Cobre a decisão pura que `app.config.js` usa — a camada que fecha a
// brecha do comando cru (`npx expo export --platform web` sem passar por
// `npm run deploy:web`). Testamos a função, não o arquivo: `app.config.js`
// chama `process.exit`, e dar `require` nele aqui mataria o test runner no
// primeiro cenário de falha.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isWebProductionExport,
  validateDeployEnvironment,
} = require('../scripts/lib/validateDeployEnvironment.cjs');

const OK_ENV = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://qenehyizxesmaeylmcjv.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.abc123',
  EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.eyJ1IjoiZWx2aXNtbGwifQ.producao',
};

const EXPORT_WEB_ARGV = ['node', '/caminho/para/expo', 'export', '--platform', 'web'];

// Cada forma abaixo foi confirmada contra o `@expo/cli` real deste projeto
// (`npx expo export --help` e rodando os comandos de verdade) -- não é só
// achismo de como o parser deveria se comportar.
test('isWebProductionExport reconhece `--platform web` (forma documentada, com espaço)', () => {
  assert.equal(isWebProductionExport(EXPORT_WEB_ARGV), true);
});

test('isWebProductionExport reconhece `-p web` (alias curto)', () => {
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '-p', 'web']), true);
});

test('isWebProductionExport reconhece `--platform=web` (forma com igual)', () => {
  // Confirmado que o Expo aceita esta forma (ao contrário de `-p=web`, que
  // ele recusa com "option requires argument" antes de exportar qualquer
  // coisa -- por isso não é um caminho de risco, e não precisa de caso aqui).
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform=web']), true);
});

test('isWebProductionExport reconhece uma lista de plataformas que inclui web', () => {
  // O Expo instalado neste projeto HOJE recusa `--platform web,ios` com
  // CommandError antes de bundlar qualquer coisa -- não é risco real agora,
  // mas tratamos mesmo assim: uma versão futura que aceite a lista não pode
  // reabrir esta brecha em silêncio.
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform', 'web,ios']), true);
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform', 'ios,web']), true);
});

test('isWebProductionExport reconhece `--platform all` (web está incluído)', () => {
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform', 'all']), true);
});

test('isWebProductionExport SEM --platform conta como produção -- é o default do Expo, `all`', () => {
  // Confirmado rodando `expo export` sem flag neste projeto: ele gera
  // `_expo/static/js/web/index-*.js` com o MESMO EXPO_PUBLIC_MAPBOX_TOKEN
  // que `--platform web` geraria. Tratar "sem flag" como "não é produção"
  // é exatamente a falha-aberta que motivou este teste.
  assert.equal(isWebProductionExport(['node', 'expo', 'export']), true);
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--output-dir', 'dist']), true);
});

test('isWebProductionExport NÃO reconhece plataformas que não geram bundle web', () => {
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform', 'ios']), false);
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform', 'android']), false);
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '-p', 'android']), false);
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform=ios']), false);
});

test('isWebProductionExport NÃO reconhece comandos que não exportam', () => {
  assert.equal(isWebProductionExport(['node', 'expo', 'start']), false);
  assert.equal(isWebProductionExport(['node', 'expo', 'config', '--type', 'public']), false);
  assert.equal(isWebProductionExport(['node', 'eas', 'build', '--platform', 'android']), false);
});

test('`--platform` sem valor reconhecível conta como produção -- falha fechado, não aberto', () => {
  // `--platform` sem nada depois, ou seguido de outra flag em vez de um
  // valor, é algo que o próprio Expo recusa antes de exportar qualquer
  // coisa. Mesmo assim, entre "não entendi e deixo passar" e "não entendi,
  // trato como produção", esta função escolhe a segunda -- é o mesmo
  // princípio que faz a AUSÊNCIA da flag contar como produção.
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform']), true);
  assert.equal(isWebProductionExport(['node', 'expo', 'export', '--platform', '--clear']), true);
});

test('ambiente completo e token igual ao de produção passa', () => {
  const result = validateDeployEnvironment({
    argv: EXPORT_WEB_ARGV,
    effectiveEnv: OK_ENV,
    productionToken: OK_ENV.EXPO_PUBLIC_MAPBOX_TOKEN,
  });
  assert.equal(result.level, 'ok');
});

test('export de produção sem variável obrigatória FALHA, nomeando a variável', () => {
  const result = validateDeployEnvironment({
    argv: EXPORT_WEB_ARGV,
    effectiveEnv: { ...OK_ENV, EXPO_PUBLIC_MAPBOX_TOKEN: '' },
    productionToken: OK_ENV.EXPO_PUBLIC_MAPBOX_TOKEN,
  });
  assert.equal(result.level, 'fail');
  assert.match(result.message, /EXPO_PUBLIC_MAPBOX_TOKEN/);
});

test('fora do export de produção, a mesma variável ausente é só AVISO', () => {
  const result = validateDeployEnvironment({
    argv: ['node', 'expo', 'start'],
    effectiveEnv: { ...OK_ENV, EXPO_PUBLIC_MAPBOX_TOKEN: '' },
    productionToken: OK_ENV.EXPO_PUBLIC_MAPBOX_TOKEN,
  });
  assert.equal(result.level, 'warn');
  assert.match(result.message, /EXPO_PUBLIC_MAPBOX_TOKEN/);
});

test('reprodução do vazamento: token efetivo diferente do de .env FALHA apontando .env.local', () => {
  // O caso real: `.env.local` (token sem restrição) sobrepôs `.env` (token
  // restrito) durante um export de produção.
  const result = validateDeployEnvironment({
    argv: EXPORT_WEB_ARGV,
    effectiveEnv: { ...OK_ENV, EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.eyJ1IjoiZWx2aXNtbGwifQ.semrestricao' },
    productionToken: OK_ENV.EXPO_PUBLIC_MAPBOX_TOKEN,
  });
  assert.equal(result.level, 'fail');
  assert.match(result.message, /\.env\.local/);
});

test('o mesmo token divergente, FORA do export de produção, não falha nem avisa', () => {
  // Em dev, o token sem restrição é o esperado -- divergir de .env é a
  // configuração correta, não um vazamento.
  const result = validateDeployEnvironment({
    argv: ['node', 'expo', 'start'],
    effectiveEnv: { ...OK_ENV, EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.eyJ1IjoiZWx2aXNtbGwifQ.semrestricao' },
    productionToken: OK_ENV.EXPO_PUBLIC_MAPBOX_TOKEN,
  });
  assert.equal(result.level, 'ok');
});

test('sem token de produção para comparar (.env não declara o Mapbox), não quebra nem falso-aprova', () => {
  const result = validateDeployEnvironment({
    argv: EXPORT_WEB_ARGV,
    effectiveEnv: OK_ENV,
    productionToken: null,
  });
  // Nada para comparar não é o vazamento que esta função pega -- a variável
  // obrigatória ausente (camada separada) é quem cobriria um `.env` vazio.
  assert.equal(result.level, 'ok');
});
