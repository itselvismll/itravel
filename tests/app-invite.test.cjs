// O convite para o app: o link vai DENTRO da mensagem.
//
// O QUE ESTE ARQUIVO PROTEGE
//
// `Share.share({ message, url })` parece entregar as duas coisas, mas vários
// aplicativos de conversa no Android leem só `message` e descartam `url`. Um
// convite montado com o endereço apenas no campo `url` chega como uma frase
// simpática sem nada para tocar — e falha em silêncio: quem compartilhou vê a
// folha do sistema abrir e fechar normalmente, e só quem recebeu descobre que o
// convite não leva a lugar nenhum.
//
// Por isso o teste afirma o link dentro do texto, e não só a chave `url`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const { APP_WEB_ORIGIN, buildAppInviteShare } = loadEsm('src/utils/appInvite.js');

test('o link do app aparece dentro da mensagem, não só no campo url', () => {
  const convite = buildAppInviteShare({ username: 'fulano' });

  assert.equal(convite.url, APP_WEB_ORIGIN);
  assert.ok(convite.message.includes(APP_WEB_ORIGIN));
});

test('com username, a mensagem traz o handle de quem convida', () => {
  const convite = buildAppInviteShare({ username: 'fulano' });
  assert.ok(convite.message.includes('@fulano'));
});

test('sem username, a mensagem continua de pé e sem arroba solta', () => {
  for (const username of [undefined, null, '', '   ']) {
    const convite = buildAppInviteShare({ username });
    assert.ok(convite.message.includes(APP_WEB_ORIGIN), `link sumiu com ${JSON.stringify(username)}`);
    assert.ok(!convite.message.includes('@'), `arroba solta com ${JSON.stringify(username)}`);
  }
});

test('o origin nunca sai com barra dobrada', () => {
  const convite = buildAppInviteShare({ username: 'fulano', origin: 'https://exemplo.test///' });
  assert.equal(convite.url, 'https://exemplo.test');
  assert.ok(!convite.message.includes('exemplo.test//'));
});

// O domínio é o mesmo que o `npm run deploy:web` publica. Se um dia o app mudar
// de endereço, este teste é o que lembra que o convite também precisa mudar.
test('o convite aponta para o domínio publicado', () => {
  assert.equal(APP_WEB_ORIGIN, 'https://journi.expo.app');
});
