// Config plugin: deixa o app ENXERGAR o Instagram.
//
// Existe porque as duas features de Instagram do perfil (compartilhar o
// passaporte nos Stories e o badge que abre o perfil da pessoa) dependem de uma
// coisa que nenhum dos dois lados declara sozinho.
//
// ANDROID
//
// A partir do Android 11 (API 30) um app não vê os outros por padrão. Sem um
// bloco `<queries>`, `Linking.canOpenURL('instagram://...')` responde `false`
// MESMO com o Instagram instalado, e o intent do react-native-share não
// resolve. O AndroidManifest do próprio react-native-share declara só o
// FileProvider dele — `<queries>` não vem de brinde.
//
// Falha silenciosa: sem isto o app não quebra, ele só decide que "o Instagram
// não está instalado" e cai no fallback do navegador, para todo mundo.
//
// iOS
//
// `LSApplicationQueriesSchemes` é a lista de schemes que o app pode consultar
// com `canOpenURL`. Fora dela a chamada retorna `false` sem perguntar ao
// sistema. São dois schemes diferentes e os dois são necessários:
// `instagram` abre o perfil (o badge) e `instagram-stories` abre o editor de
// Stories (o compartilhamento).
//
// O app.json não tem chave para nada disso — `android.queries` não existe no
// schema do Expo — então a alternativa a este plugin seria sair do managed
// workflow e manter as pastas nativas na mão.
const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const PACOTE_ANDROID = 'com.instagram.android';
const SCHEMES_IOS = ['instagram', 'instagram-stories'];

/**
 * As duas transformações são exportadas puras (recebem e devolvem o objeto, sem
 * tocar em disco) porque é o único jeito de testá-las: os `mod` do Expo só rodam
 * durante o prebuild de verdade, e `expo config` não os executa — um plugin
 * quebrado passaria despercebido até o build falhar, ou pior, até alguém
 * descobrir no aparelho que o botão nunca abriu o Instagram.
 */

/** @param {any} manifest AndroidManifest já parseado */
const aplicarQueriesAndroid = (manifest) => {
  manifest.queries = manifest.queries || [];
  if (!manifest.queries.length) manifest.queries.push({});

  const queries = manifest.queries[0];
  queries.package = queries.package || [];

  const jaDeclarado = queries.package.some(
    (entry) => entry?.$?.['android:name'] === PACOTE_ANDROID
  );
  if (!jaDeclarado) {
    queries.package.push({ $: { 'android:name': PACOTE_ANDROID } });
  }

  return manifest;
};

/** @param {any} infoPlist Info.plist já parseado */
const aplicarSchemesIos = (infoPlist) => {
  const existentes = infoPlist.LSApplicationQueriesSchemes || [];
  // União, não substituição: outras libs podem ter acrescentado os schemes delas
  // aqui, e sobrescrever a lista quebraria o `canOpenURL` delas.
  infoPlist.LSApplicationQueriesSchemes = [
    ...new Set([...existentes, ...SCHEMES_IOS]),
  ];
  return infoPlist;
};

const withInstagram = (config) => {
  const comAndroid = withAndroidManifest(config, (mod) => {
    aplicarQueriesAndroid(mod.modResults.manifest);
    return mod;
  });

  return withInfoPlist(comAndroid, (mod) => {
    aplicarSchemesIos(mod.modResults);
    return mod;
  });
};

module.exports = withInstagram;
module.exports.aplicarQueriesAndroid = aplicarQueriesAndroid;
module.exports.aplicarSchemesIos = aplicarSchemesIos;
module.exports.PACOTE_ANDROID = PACOTE_ANDROID;
module.exports.SCHEMES_IOS = SCHEMES_IOS;
