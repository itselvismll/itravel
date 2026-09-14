// O config plugin que deixa o app enxergar o Instagram.
//
// Testado porque a falha dele é SILENCIOSA: sem o `<queries>` do Android nem os
// `LSApplicationQueriesSchemes` do iOS, o app não quebra — ele apenas conclui
// que o Instagram não está instalado, para todo mundo, e cai no fallback do
// navegador. Nada no build acusa isso, e os `mod` do Expo só rodam no prebuild,
// onde ninguém confere o XML gerado.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aplicarQueriesAndroid,
  aplicarSchemesIos,
  PACOTE_ANDROID,
  SCHEMES_IOS,
} = require('../plugins/withInstagram');

const pacotesDe = (manifest) =>
  (manifest.queries?.[0]?.package || []).map((entry) => entry.$['android:name']);

test('cria o bloco queries quando o manifest não tem nenhum', () => {
  const manifest = aplicarQueriesAndroid({ application: [{}] });
  assert.deepEqual(pacotesDe(manifest), [PACOTE_ANDROID]);
});

test('preserva os pacotes que outras libs já declararam', () => {
  // Sobrescrever `queries` apagaria a visibilidade de outro app e quebraria o
  // `canOpenURL` de quem o declarou — uma falha igualmente silenciosa.
  const manifest = aplicarQueriesAndroid({
    queries: [{ package: [{ $: { 'android:name': 'com.whatsapp' } }] }],
  });
  assert.deepEqual(pacotesDe(manifest), ['com.whatsapp', PACOTE_ANDROID]);
});

test('não duplica o pacote se o plugin rodar duas vezes', () => {
  // O prebuild roda sobre um manifest que pode já ter passado pelo plugin: um
  // `<queries>` com o pacote repetido é erro de merge no build do Android.
  const manifest = aplicarQueriesAndroid(aplicarQueriesAndroid({ application: [{}] }));
  assert.deepEqual(pacotesDe(manifest), [PACOTE_ANDROID]);
});

test('declara os DOIS schemes de iOS', () => {
  // São usos diferentes e nenhum cobre o outro: `instagram` abre o perfil da
  // pessoa (o badge) e `instagram-stories` abre o editor de Stories (o
  // compartilhamento do passaporte).
  const plist = aplicarSchemesIos({});
  assert.deepEqual(plist.LSApplicationQueriesSchemes, SCHEMES_IOS);
  assert.ok(SCHEMES_IOS.includes('instagram'));
  assert.ok(SCHEMES_IOS.includes('instagram-stories'));
});

test('faz união com os schemes já presentes, sem duplicar', () => {
  const plist = aplicarSchemesIos({ LSApplicationQueriesSchemes: ['whatsapp', 'instagram'] });
  assert.deepEqual(plist.LSApplicationQueriesSchemes, ['whatsapp', 'instagram', 'instagram-stories']);
});

test('o plugin está registrado no app.json', () => {
  // Um plugin correto que ninguém registrou não faz nada.
  const app = require('../app.json');
  assert.ok(
    app.expo.plugins.includes('./plugins/withInstagram'),
    'o plugin saiu da lista de plugins do app.json'
  );
});
