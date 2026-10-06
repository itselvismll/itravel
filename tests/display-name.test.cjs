// O campo Nome do perfil que não deixava apagar.
//
// O BUG: numa conta cujo nome chegou com 14 caracteres ("Journi suporte" — o
// cadastro e o Google não passam por esta tela, então nada impedia), o campo
// recusava toda tecla. O `onChangeText` só aceitava texto com até 12
// caracteres, e apagar uma letra dava 13: recusado. A pessoa ficava presa num
// nome que não conseguia nem encurtar, com "Limite máximo atingido" embaixo.
//
// Os testes cobram a regra pura e, depois, a TELA montada de verdade: o que se
// afirma é o que acontece quando a pessoa aperta backspace e depois Salvar.
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { loadEsm } = require('./helpers/load-esm.cjs');

// Resolve chave de tradução contra o pt.json do projeto, com interpolação %{var}.
const ptJson = JSON.parse(require('fs').readFileSync(
  require('path').join(__dirname, '..', 'src/i18n/locales/pt.json'), 'utf8'
));
const tDoPt = (chave, opcoes = {}) => {
  let valor = String(chave).split('.').reduce((o, k) => (o ?? {})[k], ptJson);

  // Forma plural: a chave aponta para { one, other } e o i18n-js escolhe pelo
  // `count`. Sem isto, `common.plural.character` chegaria aqui como objeto e o
  // fake acusaria "chave inexistente" sobre uma chave que existe.
  if (valor && typeof valor === 'object' && 'other' in valor) {
    valor = opcoes.count === 1 ? valor.one : valor.other;
  }

  if (typeof valor !== 'string') throw new Error('chave inexistente no pt.json: ' + chave);
  return valor.replace(/%\{(\w+)\}/g, (_, nome) => String(opcoes[nome] ?? ''));
};
const { makeReactNative, fakeVectorIcons, host } = require('./helpers/fake-react-native.cjs');

const displayName = loadEsm('src/utils/displayName.js');
const { acceptDisplayNameInput, displayNameLengthState, DISPLAY_NAME_MAX_LENGTH } = displayName;

// ---------------------------------------------------------------------------
// A REGRA
// ---------------------------------------------------------------------------

test('o limite continua sendo 12', () => {
  assert.equal(DISPLAY_NAME_MAX_LENGTH, 12);
});

test('apagar é sempre aceito, mesmo com o nome acima do limite', () => {
  assert.equal(acceptDisplayNameInput('Journi suporte', 'Journi suport'), true);
  assert.equal(acceptDisplayNameInput('Journi suport', 'Journi suppo'), true);
  // Selecionar tudo e apagar.
  assert.equal(acceptDisplayNameInput('Journi suporte', ''), true);
});

test('crescer além do limite continua barrado', () => {
  assert.equal(acceptDisplayNameInput('Mariana Frei', 'Mariana Freit'), false);
  // Acima do limite, também não dá para crescer mais.
  assert.equal(acceptDisplayNameInput('Journi suporte', 'Journi suportes'), false);
});

test('dentro do limite, digitar funciona como sempre', () => {
  assert.equal(acceptDisplayNameInput('Mari', 'Maria'), true);
  assert.equal(acceptDisplayNameInput('Mariana Frei', 'Mariana Frei'), true);
});

test('o contador distingue "cheio" de "passou"', () => {
  assert.equal(displayNameLengthState('Mariana'), 'ok');
  assert.equal(displayNameLengthState('Mariana Frei'), 'full');
  assert.equal(displayNameLengthState('Journi suporte'), 'over');
  assert.equal(displayNameLengthState(null), 'ok');
});

// ---------------------------------------------------------------------------
// A TELA
// ---------------------------------------------------------------------------

const montarTela = (profile) => {
  const rn = makeReactNative();
  const alertas = [];
  const atualizacoes = [];

  const { default: EditProfileScreen } = loadEsm(
    'src/screens/profile/EditProfileScreen.js',
    {
      react: React,
      'react-native': {
        ...rn.module,
        TextInput: host('TextInput'),
        ActivityIndicator: host('ActivityIndicator'),
        Image: host('Image'),
        Alert: { alert: (...args) => alertas.push(args) },
      },
      '@expo/vector-icons': fakeVectorIcons,
      'expo-image-picker': {},
      '../../services/profileService': {
        updateProfile: async (id, dados) => { atualizacoes.push(dados); return { success: true }; },
        checkUsernameAvailable: async () => true,
        uploadAvatar: async () => ({ success: true }),
        requestAccountDeletion: async () => ({ success: true }),
        ACCOUNT_DELETION_GRACE_DAYS: 30,
      },
      '../../services/supabase': { getCurrentUser: async () => ({ id: profile.id }), signOut: async () => {} },
      '../../utils/dialogs': { confirm: async () => false, notify: () => {} },
      '../../utils/username': loadEsm('src/utils/username.js'),
      '../../utils/displayName': displayName,
      '../../hooks/useTabBarContentPadding': { __esModule: true, default: () => 0 },
      '../../utils/bio': loadEsm('src/utils/bio.js'),
      '../../utils/instagram': { INSTAGRAM_FEATURE_ENABLED: false, normalizeInstagramUsername: (v) => v },
      // O `t` resolve contra o pt.json DE VERDADE: estas asserções leem o texto
      // do aviso de limite na tela, então um `t` que devolvesse a chave crua
      // faria o teste passar com a chave errada.
      '../../i18n/LocaleProvider': { useLocale: () => ({ t: tDoPt }) },
    },
    { jsx: true }
  );

  let renderer;
  const navigation = { goBack: () => {} };
  TestRenderer.act(() => {
    renderer = TestRenderer.create(
      React.createElement(EditProfileScreen, { navigation, route: { params: { profile } } })
    );
  });

  const campoNome = () => renderer.root.find(
    (node) => node.type === 'TextInput' && node.props.placeholder === 'Como quer ser chamado'
  );
  const textos = () => renderer.root.findAll((node) => node.type === 'Text')
    .map((node) => [].concat(node.props.children).join(''));

  const digitar = (valor) => {
    TestRenderer.act(() => { campoNome().props.onChangeText(valor); });
  };

  /** Backspace até o nome ficar com `tamanho` caracteres, uma tecla por vez. */
  const apagarAte = (tamanho) => {
    while (campoNome().props.value.length > tamanho) {
      const antes = campoNome().props.value;
      digitar(antes.slice(0, -1));
      assert.notEqual(campoNome().props.value, antes, `o backspace foi ignorado em "${antes}"`);
    }
  };

  const salvar = async () => {
    const botao = renderer.root.findAll((node) => node.type === 'TouchableOpacity')
      .find((node) => node.findAll((filho) => filho.type === 'Text')
        .some((filho) => filho.props.children === 'Salvar'));
    await TestRenderer.act(async () => { await botao.props.onPress(); });
  };

  return { campoNome, textos, digitar, apagarAte, salvar, alertas, atualizacoes };
};

const PERFIL = {
  id: '00000000-0000-0000-0000-000000000001',
  username: 'mariana',
  display_name: 'Mariana Freitas Lima', // 20 caracteres, acima do limite
  bio: '',
};

test('nome acima do limite: dá para apagar letra por letra e salvar', async () => {
  const tela = montarTela(PERFIL);

  // Abre acima do limite, e a tela diz o que fazer em vez de "limite atingido".
  assert.ok(tela.textos().some((t) => /Apague 8 caracteres para salvar/.test(t)));
  assert.ok(!tela.textos().includes('Limite máximo atingido'));

  tela.apagarAte('Mariana'.length);
  assert.equal(tela.campoNome().props.value, 'Mariana');
  assert.ok(!tela.textos().includes('Limite máximo atingido'));
  assert.ok(tela.textos().includes('7/12'));

  await tela.salvar();
  assert.equal(tela.atualizacoes.length, 1, 'o salvamento não chegou ao updateProfile');
  assert.equal(tela.atualizacoes[0].display_name, 'Mariana');
  assert.equal(tela.alertas[0]?.[0], 'Perfil atualizado!');
});

test('o caso reportado: "Journi suporte" deixa apagar', () => {
  const tela = montarTela({ ...PERFIL, display_name: 'Journi suporte' });
  tela.apagarAte('Journi'.length);
  assert.equal(tela.campoNome().props.value, 'Journi');
});

test('acima do limite, digitar mais continua barrado', () => {
  const tela = montarTela(PERFIL);
  tela.digitar(`${PERFIL.display_name}x`);
  assert.equal(tela.campoNome().props.value, PERFIL.display_name);
});

test('nome acima do limite não salva sem encurtar', async () => {
  const tela = montarTela(PERFIL);
  await tela.salvar();
  assert.equal(tela.atualizacoes.length, 0);
  assert.ok(tela.textos().some((t) => /no máximo 12 caracteres/.test(t)));
});
