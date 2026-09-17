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

// ─────────────────────────────────────────────────────────────────────────────
// A feature está PAUSADA por decisão de produto (Trello 42SyRQ1E).
//
// Nada foi removido: schema, migration, utils, config plugin, badge e estes
// testes continuam de pé. Só a exibição passa pela flag.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const ler = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

test('a flag existe, é uma só e está desligada', () => {
  assert.equal(mod.INSTAGRAM_FEATURE_ENABLED, false);
});

test('as tres superficies de UI passam pela flag', () => {
  // O cast existe porque o TS infere o elemento da tupla como `string | RegExp`,
  // e assert.match exige RegExp no segundo argumento.
  const superficies = /** @type {[string, RegExp][]} */ ([
    ['src/screens/profile/ProfileScreen.js', /INSTAGRAM_FEATURE_ENABLED && \(\s*<InstagramBadge/],
    ['src/screens/profile/PublicProfileScreen.js', /INSTAGRAM_FEATURE_ENABLED && \(\s*<InstagramBadge/],
    ['src/components/ShareToJourniModal.js', /INSTAGRAM_FEATURE_ENABLED && !!onInstagramShare/],
  ]);
  for (const [arquivo, padrao] of superficies) {
    assert.match(ler(arquivo), padrao, `${arquivo}: a UI deixou de passar pela flag`);
  }
  // O campo do formulário é o quarto ponto, com JSX multilinha.
  assert.match(
    ler('src/screens/profile/EditProfileScreen.js'),
    /\{INSTAGRAM_FEATURE_ENABLED && \(/,
    'EditProfileScreen: o campo deixou de passar pela flag'
  );
});

test('com a feature desligada, o EditProfile NAO envia instagram_username', () => {
  // A regressao mais cara desta pausa, e a mais silenciosa: a migration da
  // coluna ainda NAO foi aplicada em producao. Se o update mandar
  // `instagram_username` assim mesmo, o PostgREST recusa a chamada INTEIRA por
  // coluna inexistente — e quebra o salvamento de nome, username, bio e avatar
  // para todo mundo, num campo que nem esta visivel na tela.
  const tela = ler('src/screens/profile/EditProfileScreen.js');
  assert.match(
    tela,
    /\.\.\.\(INSTAGRAM_FEATURE_ENABLED \? \{ instagram_username/,
    'o envio de instagram_username precisa ser condicional a flag'
  );
  assert.doesNotMatch(
    tela,
    /^\s*instagram_username: instagramNormalizado,\s*$/m,
    'instagram_username voltou a ser enviado incondicionalmente'
  );
});

test('nada da feature foi removido', () => {
  // A pausa e de exibicao, nao de codigo: religar deve ser trocar false por true.
  for (const arquivo of [
    'src/utils/instagram.js',
    'src/components/profile/InstagramBadge.js',
    'plugins/withInstagram.js',
    'supabase/migrations/20260914190000_profiles_instagram.sql',
  ]) {
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', arquivo)), `${arquivo} sumiu`);
  }
  assert.match(ler('src/services/profileService.js'), /instagram_username/);
});
