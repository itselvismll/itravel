// A URL que abre o app vira (ou não) um destino de navegação.
//
// POR QUE ISTO É TESTADO SEM APP
//
// Porque a falha deste caminho é MUDA. Quando o casamento da URL não acontece,
// o app abre na tela inicial — exatamente como abriria sem link nenhum. Não há
// erro, não há log, não há tela errada: só um convite que "não funciona", que é
// a categoria de bug mais cara de rastrear que existe.
//
// E porque as formas da URL se multiplicam fora do nosso controle: o link
// compartilhado é https, o retorno do login é `journi://`, o WhatsApp acrescenta
// barra no fim, e o Android às vezes entrega o host em maiúscula. Nenhuma dessas
// variações aparece no desenvolvimento, e todas aparecem no aparelho de alguém.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const inviteLink = loadEsm('src/utils/inviteLink.js');
// O `deepLinks` importa o `inviteLink` de verdade, e não uma cópia falsa: o que
// este teste precisa afirmar é justamente que as duas pontas do mesmo link
// combinam entre si.
const { routeForUrl, isInviteUrl } = loadEsm('src/utils/deepLinks.js', {
  './inviteLink': inviteLink,
});
const { buildInviteUrl, INVITE_WEB_ORIGIN } = inviteLink;

const TOKEN = 'a3f1e2d40000400080000000000000ab';

test('o link https compartilhado abre a tela do convite', () => {
  const rota = routeForUrl(`${INVITE_WEB_ORIGIN}/trip-invite/${TOKEN}`);

  assert.deepEqual(rota, { name: 'TripInvite', params: { token: TOKEN } });
});

test('o scheme do app, usado no retorno depois do login, também abre', () => {
  const rota = routeForUrl(`journi://trip-invite/${TOKEN}`);

  assert.equal(rota?.params.token, TOKEN);
});

test('o que buildInviteUrl gera é o que routeForUrl lê', () => {
  // As duas pontas do mesmo link moram em módulos diferentes; esta é a única
  // afirmação que as amarra. Se alguém mudar o caminho num lado, quebra aqui —
  // e não no aparelho de quem recebeu o convite.
  const url = buildInviteUrl(TOKEN);

  assert.equal(routeForUrl(url)?.params.token, TOKEN);
});

test('barra no fim e maiúsculas não impedem o reconhecimento', () => {
  // Aplicativo de conversa mexe na URL antes de entregar.
  assert.equal(routeForUrl(`${INVITE_WEB_ORIGIN}/trip-invite/${TOKEN}/`)?.params.token, TOKEN);
  assert.equal(
    routeForUrl(`${INVITE_WEB_ORIGIN}/trip-invite/${TOKEN.toUpperCase()}`)?.params.token,
    TOKEN,
  );
});

test('o token volta sempre em minúsculas', () => {
  // O banco guarda hex minúsculo; mandar a versão em caixa alta para a RPC
  // devolveria "convite inválido" para um convite perfeitamente válido.
  const rota = routeForUrl(`journi://trip-invite/${TOKEN.toUpperCase()}`);

  assert.equal(rota?.params.token, rota?.params.token.toLowerCase());
});

test('URL que não é nossa devolve null, em silêncio', () => {
  // O Expo entrega aqui TODA url que abre o app. Nenhuma destas é erro.
  const estranhas = [
    'exp://192.168.0.10:8081',
    'https://journi.expo.app/',
    'journi://profile/marifreitas',
    'https://example.com/trip-invite/nao-e-um-token',
    'com.googleusercontent.apps.123://oauth?code=abc',
    '',
    null,
    undefined,
  ];

  for (const url of estranhas) {
    assert.equal(routeForUrl(url), null, `não deveria casar: ${String(url)}`);
  }
});

test('token com tamanho errado não vira destino', () => {
  // Meio token é pior do que nenhum: levaria à tela do convite só para falhar.
  assert.equal(routeForUrl(`${INVITE_WEB_ORIGIN}/trip-invite/${TOKEN.slice(0, 20)}`), null);
  assert.equal(routeForUrl(`${INVITE_WEB_ORIGIN}/trip-invite/${TOKEN}ff`), null);
});

test('isInviteUrl responde o mesmo que routeForUrl', () => {
  assert.equal(isInviteUrl(buildInviteUrl(TOKEN)), true);
  assert.equal(isInviteUrl('exp://192.168.0.10:8081'), false);
});

test('o destino é a rota registrada no navegador', () => {
  // "TripInvite" precisa ser exatamente o `name` do Stack.Screen. Escrito
  // diferente, o navigate é descartado em silêncio.
  assert.equal(routeForUrl(buildInviteUrl(TOKEN))?.name, 'TripInvite');
});
