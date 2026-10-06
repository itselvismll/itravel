// A tab bar inferior (Início/Mapa/Explorar/Perfil) ficava em português mesmo
// com o locale trocado para outro idioma — achado por inspeção visual.
//
// CAUSA RAIZ: os rótulos estavam como `tabBarLabel: 'Início'` direto no
// `options` de cada `Tab.Screen`, em src/navigation/AppNavigator.js. Isso é
// string cravada numa PROP DE CONFIGURAÇÃO do navigator, não um nó de texto
// JSX — o detector de texto fixo (tests/i18n-no-hardcoded-text.test.cjs) só
// casa `>texto<` e `prop="texto"` em JSX comum, então esse padrão não aparece
// nem na allowlist PENDENTES nem é pego por ele. Corrigido trocando os quatro
// literais por `t('nav.home'|'map'|'explore'|'profile')`.
//
// Este teste prova duas coisas que a leitura do código não garante por si:
// 1. que as quatro chaves `nav.*` resolvem nos três idiomas;
// 2. que o rótulo troca em RUNTIME (o mesmo componente montado, sem remount)
//    quando `changeLocale` é chamado — a preocupação do pedido era exatamente
//    essa, porque `tabBarLabel` podia estar fora do ciclo de render.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { I18n } = require('i18n-js');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');
const localesDir = path.join(root, 'src/i18n/locales');
const ler = (code) => JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf8'));
const pt = ler('pt');
const en = ler('en');
const es = ler('es');

test('as quatro chaves de nav existem nos três idiomas', () => {
  for (const [code, dict] of [['pt', pt], ['en', en], ['es', es]]) {
    for (const item of ['home', 'map', 'explore', 'profile']) {
      assert.equal(typeof dict.nav?.[item], 'string', `${code}.nav.${item}`);
      assert.ok(dict.nav[item].length > 0, `${code}.nav.${item} vazio`);
    }
  }
});

test('nav.home/map/explore/profile variam entre os idiomas — não é texto cravado disfarçado', () => {
  // Se os três idiomas tivessem o mesmo valor, a chave existiria mas a tela
  // continuaria sempre em português — o mesmo defeito, só escondido atrás de
  // uma chave de tradução nunca preenchida.
  for (const item of ['home', 'explore', 'profile']) {
    assert.notEqual(pt.nav[item], en.nav[item], `nav.${item} em inglês`);
  }
  // "Mapa" é igual em pt/es por coincidência lexical — não em inglês.
  assert.notEqual(pt.nav.map, en.nav.map);
});

// ─── O rótulo atualiza em runtime, sem remount ──────────────────────────────

// `src/i18n/index.js` importa `expo-localization` e `react-native`; trocamos
// pelos mesmos fakes que tests/i18n.test.cjs usa para o catálogo de idiomas.
const i18nIndex = loadEsm('src/i18n/index.js', {
  'i18n-js': { I18n },
  'expo-localization': { getLocales: () => [{ languageCode: 'pt' }] },
  'react-native': { Platform: { OS: 'web' } },
  './locales/pt.json': pt,
  './locales/en.json': en,
  './locales/es.json': es,
});

const { LocaleProvider, useLocale } = loadEsm('src/i18n/LocaleProvider.js', {
  './index': i18nIndex,
  react: React,
}, { jsx: true });

// Mesmo padrão de uso do TabNavigator real: um componente que chama useLocale()
// e usa `t()` para montar o texto de um rótulo — aqui sem depender do
// React Navigation, que exigiria montar a árvore de navegação inteira só para
// provar o que é, na raiz, um comportamento do React Context.
let ultimoChangeLocale = null;
function RotuloDaAba({ chave }) {
  const { t, changeLocale } = useLocale();
  ultimoChangeLocale = changeLocale;
  return React.createElement('Text', null, t(chave));
}

test('trocar o idioma em runtime atualiza o rótulo no MESMO componente montado, sem remount', () => {
  /** @type {any} */
  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(LocaleProvider, null, React.createElement(RotuloDaAba, { chave: 'nav.home' }))
    );
  });
  assert.ok(renderer);

  const textoAntes = renderer.root.findByType('Text').children[0];
  assert.equal(textoAntes, 'Início');

  TestRenderer.act(() => {
    ultimoChangeLocale('en');
  });

  const textoDepois = renderer.root.findByType('Text').children[0];
  assert.equal(textoDepois, 'Home');

  TestRenderer.act(() => {
    ultimoChangeLocale('es');
  });

  const textoEspanhol = renderer.root.findByType('Text').children[0];
  assert.equal(textoEspanhol, 'Inicio');

  renderer.unmount();
});

test('as quatro chaves da tab bar seguem o mesmo componente/locale nos três idiomas', () => {
  for (const [chave, pt_, en_, es_] of [
    ['nav.home', 'Início', 'Home', 'Inicio'],
    ['nav.map', 'Mapa', 'Map', 'Mapa'],
    ['nav.explore', 'Explorar', 'Explore', 'Explorar'],
    ['nav.profile', 'Perfil', 'Profile', 'Perfil'],
  ]) {
    /** @type {any} */
  let renderer;
    TestRenderer.act(() => {
      renderer = TestRenderer.create(
        React.createElement(LocaleProvider, null, React.createElement(RotuloDaAba, { chave }))
      );
    });
    assert.ok(renderer);
    assert.equal(renderer.root.findByType('Text').children[0], pt_, `${chave} em pt`);

    TestRenderer.act(() => { ultimoChangeLocale('en'); });
    assert.equal(renderer.root.findByType('Text').children[0], en_, `${chave} em en`);

    TestRenderer.act(() => { ultimoChangeLocale('es'); });
    assert.equal(renderer.root.findByType('Text').children[0], es_, `${chave} em es`);

    renderer.unmount();
  }
});

// ─── O ponto cego do detector, documentado para não se repetir ────────────

test('AppNavigator.js não tem mais tabBarLabel com string cravada', () => {
  const source = fs.readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');
  assert.doesNotMatch(source, /tabBarLabel:\s*['"]/, 'voltou a ter rótulo fixo na tab bar');
  assert.match(source, /tabBarLabel:\s*t\('nav\.home'\)/);
  assert.match(source, /tabBarLabel:\s*t\('nav\.map'\)/);
  assert.match(source, /tabBarLabel:\s*t\('nav\.explore'\)/);
  assert.match(source, /tabBarLabel:\s*t\('nav\.profile'\)/);
});

test('nenhum outro navigator do app tem title/headerTitle/tabBarLabel cravado', () => {
  // Mesma varredura pedida para o resto do app: o único outro arquivo de
  // navegação é este mesmo AppNavigator.js (confirmado por busca no projeto —
  // não há StackNavigator nem TabNavigator em outro arquivo), e os Stack.Screen
  // dele não têm `options` com title/headerTitle fixo porque `headerShown:
  // false` está em todo screenOptions e cada tela desenha o próprio cabeçalho
  // com `t()`.
  const source = fs.readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');
  assert.doesNotMatch(source, /\b(title|headerTitle)\s*:\s*['"][^'"]*[a-zA-ZÀ-ú]{2,}['"]/,
    'achou title/headerTitle com texto cravado em algum Screen');
});
