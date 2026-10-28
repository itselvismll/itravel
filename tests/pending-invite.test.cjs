// O convite sobrevive ao caminho até a sessão.
//
// O QUE ESTE ARQUIVO REPRODUZ
//
// O bug que foi à produção: quem recebe um convite quase nunca está logado, e
// na web entrar na conta SAI DA PÁGINA. O destino do link vivia no estado do
// React, então voltar do Google (que retorna em `origin`, sem o caminho do
// convite) ou abrir a aba de confirmação de e-mail apagava o convite junto com
// a página. A pessoa terminava logada, na tela inicial, e o relato era "cliquei
// no link e não aconteceu nada".
//
// Os testes abaixo encenam a travessia em três atos — ver a URL deslogado,
// perder a página, voltar em `origin` — porque é só na terceira que o bug
// aparece. Testar `savePendingInvite` e `readPendingInvite` isolados passaria
// sem provar nada do que quebrou.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const inviteLink = loadEsm('src/utils/inviteLink.js');
const deepLinks = loadEsm('src/utils/deepLinks.js', { './inviteLink': inviteLink });
const {
  PENDING_INVITE_KEY,
  PENDING_INVITE_MAX_AGE_MS,
  clearPendingInvite,
  readPendingInvite,
  savePendingInvite,
  startupRoute,
} = loadEsm('src/utils/pendingInvite.js', {
  './deepLinks': deepLinks,
  './inviteLink': inviteLink,
});

const TOKEN = 'a3f1e2d40000400080000000000000ab';
const URL_CONVITE = `${inviteLink.INVITE_WEB_ORIGIN}/trip-invite/${TOKEN}`;

/** Um localStorage de mentira. */
const makeStorage = (inicial = {}) => {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k) => (k in dados ? dados[k] : null),
    setItem: (k, v) => { dados[k] = String(v); },
    removeItem: (k) => { delete dados[k]; },
  };
};

test('o convite aberto deslogado sobrevive ao login que sai da página', () => {
  const storage = makeStorage();

  // Ato 1: a pessoa abre o link. Não há sessão ainda; o app mostra o login.
  const aoAbrir = startupRoute(URL_CONVITE, storage);
  assert.deepEqual(aoAbrir, { name: 'TripInvite', params: { token: TOKEN } });

  // Ato 2: entrar com Google leva embora a página. O estado do React morre —
  // aqui isso é simplesmente não reaproveitar nada do ato 1.

  // Ato 3: o Supabase devolve a pessoa para a origem, SEM o caminho do convite.
  // É exatamente esta URL que o navegador entrega de volta ao app.
  const aoVoltar = startupRoute(`${inviteLink.INVITE_WEB_ORIGIN}/`, storage);

  assert.deepEqual(
    aoVoltar,
    { name: 'TripInvite', params: { token: TOKEN } },
    'voltar do login em `origin` tem de reencontrar o convite',
  );
});

test('sem armazenamento (iOS/Android), a URL ainda decide sozinha', () => {
  // No celular quem chama passa `null`: o retorno do OAuth acontece dentro do
  // mesmo processo e o estado em memória não se perde. O módulo não pode exigir
  // armazenamento para funcionar.
  assert.deepEqual(startupRoute(URL_CONVITE, null), { name: 'TripInvite', params: { token: TOKEN } });
  assert.equal(startupRoute('journi://alguma-outra-coisa', null), null);
});

test('abertura comum do app não inventa destino', () => {
  const storage = makeStorage();

  assert.equal(startupRoute(`${inviteLink.INVITE_WEB_ORIGIN}/`, storage), null);
  assert.equal(startupRoute(null, storage), null);
  assert.equal(startupRoute('exp://192.168.0.10:8081', storage), null);
});

test('depois de entrar na viagem, o convite é esquecido', () => {
  const storage = makeStorage();
  startupRoute(URL_CONVITE, storage);

  clearPendingInvite(storage);

  assert.equal(readPendingInvite(storage), null);
  assert.equal(
    startupRoute(`${inviteLink.INVITE_WEB_ORIGIN}/`, storage),
    null,
    'sem esquecer, a tela do convite reabriria a cada abertura do app',
  );
});

test('convite guardado vence em um dia', () => {
  const storage = makeStorage();
  const ontem = Date.now() - PENDING_INVITE_MAX_AGE_MS - 1000;

  savePendingInvite(storage, { name: 'TripInvite', params: { token: TOKEN } }, ontem);

  assert.equal(readPendingInvite(storage), null);
  assert.equal(
    storage.getItem(PENDING_INVITE_KEY),
    null,
    'o vencido sai do armazenamento em vez de ser reavaliado toda vez',
  );
});

test('o que está guardado é validado como se viesse de fora', () => {
  // Na web o localStorage é editável pelo console. Nada daqui vira navegação
  // sem passar pelo mesmo crivo de uma URL desconhecida.
  const comLixo = (valor) => {
    const storage = makeStorage({ [PENDING_INVITE_KEY]: valor });
    return readPendingInvite(storage);
  };

  assert.equal(comLixo('não é json'), null);
  assert.equal(comLixo(JSON.stringify({ name: 'TripInvite', params: { token: 'curto' }, savedAt: Date.now() })), null);
  assert.equal(comLixo(JSON.stringify({ name: 'Login', params: { token: TOKEN }, savedAt: Date.now() })), null);
  assert.equal(comLixo(JSON.stringify({ name: 'TripInvite', params: {}, savedAt: Date.now() })), null);
  assert.equal(comLixo(JSON.stringify({ name: 'TripInvite', params: { token: TOKEN } })), null);
});

test('armazenamento que lança não derruba a abertura do app', () => {
  // Safari privado e cookies de terceiros bloqueados lançam em getItem/setItem.
  const explosivo = {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('SecurityError'); },
  };

  assert.deepEqual(
    startupRoute(URL_CONVITE, explosivo),
    { name: 'TripInvite', params: { token: TOKEN } },
    'a URL da vez continua valendo mesmo sem conseguir guardar',
  );
  assert.equal(startupRoute(`${inviteLink.INVITE_WEB_ORIGIN}/`, explosivo), null);
  assert.doesNotThrow(() => clearPendingInvite(explosivo));
});

test('o token é guardado em minúsculas, como o banco tem', () => {
  const storage = makeStorage();

  startupRoute(`${inviteLink.INVITE_WEB_ORIGIN}/trip-invite/${TOKEN.toUpperCase()}`, storage);

  assert.equal(readPendingInvite(storage)?.params.token, TOKEN);
});

test('um convite novo substitui o anterior', () => {
  // Duas viagens, dois links, um navegador. Vale o último aberto.
  const storage = makeStorage();
  const outro = 'b4e2f3a50000400080000000000000cd';

  startupRoute(URL_CONVITE, storage);
  startupRoute(`${inviteLink.INVITE_WEB_ORIGIN}/trip-invite/${outro}`, storage);

  assert.equal(readPendingInvite(storage)?.params.token, outro);
});
