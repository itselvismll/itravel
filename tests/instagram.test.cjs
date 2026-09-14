// A normalização do @ do Instagram e a montagem dos links.
//
// É a parte do módulo que roda sem React Native, e é onde moram as decisões que
// o usuário percebe: o que ele digita no EditProfile vira o que é gravado no
// banco e o que abre (ou não) o app do Instagram depois.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const mod = loadEsm('src/utils/instagram.js', {
  'react-native': {
    Linking: { canOpenURL: async () => false, openURL: async () => {} },
    Platform: { OS: 'ios' },
  },
});

test('tira o @ que a pessoa digita', () => {
  assert.equal(mod.normalizeInstagramUsername('@elviss'), 'elviss');
  assert.equal(mod.normalizeInstagramUsername('elviss'), 'elviss');
});

test('aceita a URL inteira colada do navegador', () => {
  // Colar o link do perfil é o que mais acontece na prática — mais até do que
  // digitar o @ — e guardar "https://instagram.com/elviss" como username faria
  // o deep link virar `instagram://user?username=https://...`.
  assert.equal(mod.normalizeInstagramUsername('https://instagram.com/elviss'), 'elviss');
  assert.equal(mod.normalizeInstagramUsername('https://www.instagram.com/elviss/'), 'elviss');
  assert.equal(mod.normalizeInstagramUsername('instagram.com/elviss?hl=pt'), 'elviss');
});

test('tolera espaço em volta e @ repetido', () => {
  assert.equal(mod.normalizeInstagramUsername('  @@elviss  '), 'elviss');
});

test('aceita ponto e underline, que o Instagram permite', () => {
  assert.equal(mod.normalizeInstagramUsername('elvis.misael_23'), 'elvis.misael_23');
});

test('devolve vazio para o que não é username', () => {
  // Vazio é o contrato de "não informado": quem chama não precisa validar
  // formato para decidir se mostra o badge.
  for (const entrada of ['', '   ', '@', null, undefined, 42, 'elvis misael', 'elvis/misael', 'a'.repeat(31)]) {
    assert.equal(mod.normalizeInstagramUsername(entrada), '', `entrada: ${JSON.stringify(entrada)}`);
  }
});

test('os dois links são montados a partir do username limpo', () => {
  assert.equal(mod.instagramWebUrl('elviss'), 'https://instagram.com/elviss');
  assert.equal(mod.instagramAppUrl('elviss'), 'instagram://user?username=elviss');
});

test('sem App ID do Facebook, o Stories nem tenta compartilhar', () => {
  // O Instagram exige o appId desde jan/2023. Falhar aqui, com status próprio,
  // é o que permite avisar "não configurado" em vez de "erro ao compartilhar" —
  // que mandaria quem investiga procurar defeito no aparelho.
  assert.equal(mod.STORIES_SEM_APP_ID, 'sem-app-id');
  assert.equal(mod.facebookAppId, '');
});
