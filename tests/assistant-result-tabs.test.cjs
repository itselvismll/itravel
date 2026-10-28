// Regressão de 06/10/2026: a tela de resultado do assistente crashava ao
// abrir QUALQUER roteiro salvo, com "Cannot read properties of undefined
// (reading 'split')" dentro do i18n-js.
//
// CAUSA RAIZ (código, não dado legado): `visibleTabs` faz
// `TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) }))` incondicionalmente
// para toda aba — e a aba "chat" tinha ficado com `label: 'Ajustar'` cravado em
// vez de `labelKey`, sobrevivendo à extração de texto fixo. `t(undefined)`
// bate numa chave que não é string, e o i18n-js quebra tentando processá-la
// (ver o teste de reprodução abaixo). O mapa (MapLibre "Cannot read properties
// of undefined (reading 'getImage')") é CONSEQUÊNCIA: o `useMemo` de
// `visibleTabs` lança DURANTE O RENDER, React aborta o commit a meio caminho, e
// o que já tinha montado do mapa fica com o ciclo de vida incompleto.
//
// Isto não tem nada a ver com dado SALVO em produção — nenhum roteiro, novo ou
// antigo, escapa: a lista `TABS` é constante no código, o mesmo em todo roteiro.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { I18n } = require('i18n-js');

const root = path.resolve(__dirname, '..');
const localesDir = path.join(root, 'src/i18n/locales');
const ler = (code) => JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf8'));
const pt = ler('pt');
const en = ler('en');
const es = ler('es');

const screenSource = fs.readFileSync(
  path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
  'utf8'
);

// Extrai o array TABS do código-fonte, sem executar o arquivo (ele importa
// react-native, maps e um punhado de serviços — pesado para este teste).
const tabsMatch = screenSource.match(/const TABS = \[([\s\S]*?)\n\];/);

test('o array TABS existe e tem o formato esperado', () => {
  assert.ok(tabsMatch, 'não achei "const TABS = [...]" em AssistantResultScreen.js — o teste precisa ser atualizado junto com o código');
});

const tabEntries = [...(tabsMatch?.[1] || '').matchAll(/\{\s*id:\s*'([^']+)'[^}]*\}/g)];

test('toda aba tem pelo menos uma entrada reconhecida', () => {
  assert.ok(tabEntries.length >= 5, `esperava pelo menos 5 abas, achei ${tabEntries.length}`);
});

test('NENHUMA aba usa `label:` cravado — todas têm `labelKey`', () => {
  // Esta é a trava direta do bug: `visibleTabs` resolve TODA aba por
  // `t(tab.labelKey)`, então uma aba com `label:` em vez de `labelKey:` vira
  // `t(undefined)` e derruba a tela inteira, não só aquela aba.
  for (const [tabBlock] of tabsMatch[1].matchAll(/\{[^}]*\}/g)) {
    const idMatch = tabBlock.match(/id:\s*'([^']+)'/);
    const id = idMatch ? idMatch[1] : '(sem id)';
    assert.doesNotMatch(tabBlock, /(?<!label)Key:\s*'[^']*',[^}]*\blabel:\s*'/, `aba "${id}" parece ter label: cravado`);
    assert.match(tabBlock, /labelKey:\s*'([^']+)'/, `aba "${id}" não tem labelKey`);
  }
});

test('toda labelKey de TABS resolve para string nos três idiomas, sem quebrar', () => {
  for (const [name, dict] of [['pt', pt], ['en', en], ['es', es]]) {
    const i18n = new I18n({ [name]: dict });
    i18n.defaultLocale = name;
    i18n.enableFallback = true;
    i18n.locale = name;
    i18n.missingBehavior = 'guess';

    for (const [, key] of tabsMatch[1].matchAll(/labelKey:\s*'([^']+)'/g)) {
      let resultado = /** @type {unknown} */ (undefined);
      assert.doesNotThrow(() => { resultado = i18n.t(key); }, `t('${key}') quebrou em ${name}`);
      assert.equal(typeof resultado, 'string', `t('${key}') não devolveu string em ${name}`);
      assert.ok(/** @type {string} */ (resultado).length > 0, `t('${key}') devolveu vazio em ${name}`);
    }
  }
});

test('reprodução exata do crash original: t(undefined) quebra o i18n-js com "reading \'split\'"', () => {
  // Prova que a causa raiz identificada é REAL, e não só plausível: chamar
  // t() com uma chave undefined (o que `tab.labelKey` valia para a aba "chat"
  // antes do conserto) reproduz literalmente a mensagem de erro do incidente.
  const i18n = new I18n({ pt });
  i18n.defaultLocale = 'pt';
  i18n.enableFallback = true;
  i18n.locale = 'pt';
  i18n.missingBehavior = 'guess';

  assert.throws(
    () => i18n.t(undefined),
    /reading 'split'/,
    'se isto não quebrar mais, o i18n-js mudou de comportamento — revisar este teste'
  );
});

// ─── A consequência do incidente: sem boundary, o erro derrubou o globo também ──

test('AssistantResultScreen tem rede de segurança própria (não derruba o resto do stack)', () => {
  // Sem isto, qualquer erro de render nesta tela (não só o do TABS, qualquer
  // um) desmonta a árvore inteira do Stack para cima — incluindo o `Main`
  // (TabNavigator) que fica montado por baixo com o globo ao vivo. Foi esse o
  // mecanismo do segundo erro do incidente (MapLibre "reading 'getImage'"):
  // consequência, não bug independente do MapLibre.
  const navSource = fs.readFileSync(path.join(root, 'src/navigation/AppNavigator.js'), 'utf8');
  assert.match(
    navSource,
    /const AssistantResultScreenSafe = withErrorBoundary\(AssistantResultScreen, '[^']+'\)/,
    'AssistantResultScreen precisa estar envolvido em withErrorBoundary, igual Feed/Mapa/Explorar/Perfil'
  );
  assert.match(
    navSource,
    /name="AssistantResult"\s*\n\s*component=\{AssistantResultScreenSafe\}/,
    'o Stack.Screen "AssistantResult" precisa usar a versão protegida'
  );
});
