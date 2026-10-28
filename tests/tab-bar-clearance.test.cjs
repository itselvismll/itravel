// A REGRA: toda tela registrada na `ProfileStack` (a única stack deste app
// que vive DENTRO do `Tab.Navigator` "MainTabs" -- ver AppNavigator.js e o
// comentário de `useTabBarContentPadding`) tem a barra de abas flutuando
// sobre o conteúdo. Uma tela rolável que não reserva essa folga termina com o
// rodapé da lista nascendo atrás da barra -- rolável até lá, mas inacessível.
// Já aconteceu em Explorar, FAQ, Idioma, Notificações e Usuários bloqueados.
//
// POR QUE ESTE TESTE DESCOBRE A TELA, EM VEZ DE NOMEAR UMA LISTA
//
// Um teste que checasse "FAQScreen usa o hook? Support usa o hook?" por nome
// passa feliz quando alguém cria a PRÓXIMA tela de configurações e esquece o
// hook -- é exatamente o bug que motivou isto, só que adiado. Este teste lê
// `AppNavigator.js`, extrai toda tela de dentro de `function ProfileStack()`
// e confere cada uma: tela nova na stack entra na checagem sem precisar de
// nenhuma edição aqui.
//
// A CATRACA, PARA A EXCEÇÃO LEGÍTIMA
//
// Nem toda tela rolável precisa da folga -- uma que não termina perto do
// rodapé, por exemplo. Para essa exceção existir sem silenciar o detector,
// ela entra em `EXEMPT_SCREENS`, COM o motivo, no mesmo espírito da
// classificação obrigatória/opcional de `scripts/check-build-env.cjs`. Uma
// tela que sai da stack e continua na lista falha o teste de "lista não
// cresce sem motivo" abaixo -- a exceção não pode ficar esquecida depois que
// a tela que ela cobria deixou de existir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const navigatorPath = path.join(root, 'src/navigation/AppNavigator.js');
const navigatorSource = fs.readFileSync(navigatorPath, 'utf8');

/**
 * Nenhuma tela está aqui hoje -- todas as telas da ProfileStack já usam o
 * hook. Entrada de exemplo, para quando a primeira exceção legítima aparecer:
 *
 *   SomeScreen: 'não rola o bastante para alcançar o rodapé: conteúdo fixo
 *     de uma linha só, sem lista nem campo que cresça.',
 *
 * @type {Readonly<Record<string, string>>}
 */
const EXEMPT_SCREENS = Object.freeze({});

/**
 * Extrai `{ name, component }` de todo `<Stack.Screen .../>` dentro do corpo
 * de `function ProfileStack() { ... }`.
 *
 * @param {string} source o código-fonte de AppNavigator.js
 * @returns {Array<{ screenName: string, componentName: string }>}
 */
const extractProfileStackScreens = (source) => {
  const inicio = source.indexOf('function ProfileStack()');
  assert.ok(inicio >= 0, 'AppNavigator.js não tem mais "function ProfileStack()" -- este teste precisa ser atualizado junto');

  const fimDaFuncao = source.indexOf('\n}', inicio);
  const corpo = source.slice(inicio, fimDaFuncao);

  return [...corpo.matchAll(/<Stack\.Screen\s+name="([^"]+)"\s+component=\{(\w+)\}/g)]
    .map(([, screenName, componentName]) => ({ screenName, componentName }));
};

/**
 * Resolve `ComponentName` para o caminho do arquivo, a partir do `import
 * ComponentName from '...'` no topo do mesmo arquivo.
 *
 * @param {string} source
 * @param {string} componentName
 * @returns {string} caminho absoluto do arquivo do componente
 */
const resolveComponentFile = (source, componentName) => {
  const regex = new RegExp(`^import ${componentName} from '([^']+)';`, 'm');
  const match = regex.exec(source);
  assert.ok(match, `não achei "import ${componentName} from '...'" em AppNavigator.js`);

  const importPath = match[1];
  const resolved = path.resolve(path.dirname(navigatorPath), `${importPath}.js`);
  assert.ok(fs.existsSync(resolved), `${componentName} resolveria para ${resolved}, que não existe`);
  return resolved;
};

const screens = extractProfileStackScreens(navigatorSource);

test('a ProfileStack tem pelo menos as telas de configuração já conhecidas (o parser não quebrou)', () => {
  const nomes = screens.map((s) => s.screenName);
  for (const esperado of ['ProfileMain', 'Support', 'BlockedUsers', 'NotificationPreferences', 'Language', 'FAQ', 'FAQCategory']) {
    assert.ok(nomes.includes(esperado), `esperava "${esperado}" na ProfileStack, achei: ${nomes.join(', ')}`);
  }
});

test('toda tela rolável da ProfileStack reserva a folga da tab bar flutuante, ou está em EXEMPT_SCREENS com motivo', () => {
  const semFolga = [];

  for (const { screenName, componentName } of screens) {
    const arquivo = resolveComponentFile(navigatorSource, componentName);
    const code = fs.readFileSync(arquivo, 'utf8');

    const rolavel = /\b(ScrollView|FlatList|SectionList)\b/.test(code);
    if (!rolavel) continue;

    if (Object.hasOwn(EXEMPT_SCREENS, screenName)) continue;

    if (!/useTabBarContentPadding/.test(code)) {
      semFolga.push(`${screenName} (${path.relative(root, arquivo)})`);
    }
  }

  assert.deepEqual(
    semFolga,
    [],
    `tela rolável sem useTabBarContentPadding: ${semFolga.join(', ')}. `
    + 'Some a folga (ver FAQScreen.js ou SupportScreen.js) ou, se for exceção '
    + 'legítima, acrescente a EXEMPT_SCREENS aqui, com o motivo.'
  );
});

test('EXEMPT_SCREENS não tem entrada para tela que saiu da ProfileStack', () => {
  const nomesNaStack = new Set(screens.map((s) => s.screenName));
  const orfas = Object.keys(EXEMPT_SCREENS).filter((nome) => !nomesNaStack.has(nome));
  assert.deepEqual(orfas, [], `EXEMPT_SCREENS cita tela que não está mais na ProfileStack: ${orfas.join(', ')}`);
});
