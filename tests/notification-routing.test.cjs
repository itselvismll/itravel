// A notificação da lista é TOCADA, não lida com expressão regular.
//
// POR QUE ESTE TESTE EXISTE
//
// Em produção o convite direto chegava: a linha aparecia na lista, com avatar,
// texto e horário. Tocar nela não fazia nada. Nada mesmo — sem erro, sem tela
// errada, sem log. A causa não estava no roteamento (`getRoute` sempre soube
// levar `trip_invite` à viagem) nem na tela de destino: estava no `select` da
// consulta, que não pedia a coluna `target_id`. Sem ela, `getRoute` devolve
// null, e a linha é renderizada com `disabled` — um item de lista que existe,
// parece clicável e não é.
//
// Um teste de código-fonte não pegaria isso: a chamada a `getRoute` está lá, o
// `onPress` está lá, o destino está registrado. O que faltava era um DADO, e só
// montando a tela com o Supabase respondendo como o PostgREST responde — isto
// é, devolvendo SÓ as colunas que o select pediu — o buraco aparece.
//
// É por isso que o supabase de mentira aqui projeta a linha pelo select em vez
// de devolver o objeto inteiro: devolver tudo esconderia exatamente o bug que
// este arquivo existe para impedir de voltar.
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { loadEsm } = require('./helpers/load-esm.cjs');
const { makeReactNative, fakeVectorIcons, host } = require('./helpers/fake-react-native.cjs');

const socialNotifications = loadEsm('src/utils/socialNotifications.js');
const notificationRouting = loadEsm('src/utils/notificationRouting.js');

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR = { id: '22222222-2222-4222-8222-222222222222', username: 'vero', display_name: 'Vero' };

/** Uma linha de `notifications` como os triggers da migração 20260917130000 a escrevem. */
const linhaDoBanco = (overrides = {}) => ({
  id: 'n1',
  type: 'trip_invite',
  message: 'te convidou para uma viagem',
  read: false,
  created_at: new Date().toISOString(),
  actor_id: ACTOR.id,
  photo_id: null,
  conversation_id: null,
  passport_share_id: null,
  // O trigger grava o id da viagem aqui — `notifications` não tem coluna
  // `trip_id`. Quem não pedir `target_id` no select não tem como chegar à viagem.
  target_id: TRIP_ID,
  preview: 'Itália em outubro',
  actor: ACTOR,
  ...overrides,
});

/**
 * Os nomes de coluna de um `select` do PostgREST, incluindo o apelido do join
 * (`actor:actor_id(...)` é pedido como `actor`).
 */
const colunasPedidas = (select) => String(select)
  .replace(/\([^)]*\)/g, '')
  .split(',')
  .map((parte) => parte.trim().split(':')[0].trim())
  .filter(Boolean);

/** Devolve a linha com SÓ as colunas do select, como o PostgREST devolveria. */
const projetar = (linha, select) => {
  const colunas = colunasPedidas(select);
  return Object.fromEntries(
    Object.entries(linha).filter(([coluna]) => colunas.includes(coluna))
  );
};

/**
 * Um supabase de mentira: encadeia o que a tela encadeia e responde à consulta
 * de leitura projetando pelas colunas pedidas.
 */
const makeSupabase = (linhas) => {
  const selects = [];

  const thenable = (valor) => {
    const chain = {
      select: (cols) => { chain._select = cols; selects.push(cols); return chain; },
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => chain,
      then: (resolve) => resolve(valor(chain._select)),
    };
    return chain;
  };

  return {
    selects,
    supabase: {
      from: () => thenable((select) => ({
        data: select ? linhas.map((linha) => projetar(linha, select)) : null,
        error: null,
      })),
    },
  };
};

/** Monta a tela de notificações e devolve o que o teste precisa para tocar nela. */
const montarTela = async (linhas) => {
  const rn = makeReactNative();
  const { supabase, selects } = makeSupabase(linhas);

  // FlatList de mentira: desenha os itens como a de verdade desenha, para o
  // teste poder achar a linha e chamar o `onPress` dela.
  const FlatList = ({ data, renderItem, ListEmptyComponent }) => React.createElement(
    'FlatList',
    null,
    (data || []).length
      ? (data || []).map((item, index) => React.createElement(
        React.Fragment,
        { key: item.id || index },
        renderItem({ item, index })
      ))
      : ListEmptyComponent || null
  );

  const navegacoes = [];
  const navigation = {
    navigate: (name, params) => { navegacoes.push({ name, params }); },
    goBack: () => {},
  };

  const { default: NotificationsScreen } = loadEsm(
    'src/screens/NotificationsScreen.js',
    {
      react: React,
      'react-native': { ...rn.module, FlatList, ActivityIndicator: host('ActivityIndicator') },
      // useFocusEffect roda o efeito uma vez, que é o que a tela faz ao abrir.
      '@react-navigation/native': { useFocusEffect: (cb) => React.useEffect(cb, [cb]) },
      '@expo/vector-icons': fakeVectorIcons,
      '../services/supabase': { supabase, getCurrentUser: async () => ({ id: 'u1' }) },
      '../utils/constants': { COLORS: new Proxy({}, { get: () => '#000000' }) },
      // `__esModule` porque a tela importa o Avatar como default: sem a marca, o
      // interop do Babel embrulha o fake mais uma vez e o React recebe um objeto.
      '../components/Avatar': { __esModule: true, default: host('Avatar') },
      '../utils/notificationRouting': notificationRouting,
      '../utils/socialNotifications': socialNotifications,
    },
    { jsx: true }
  );

  let renderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(NotificationsScreen, { navigation }));
  });

  /** As linhas da lista, na ordem em que estão desenhadas. */
  const linhasDaLista = () => renderer.root
    .findAll((node) => node.type === 'TouchableOpacity' && Array.isArray(node.props.style))
    .filter((node) => node.findAll((filho) => filho.type === 'Avatar').length > 0);

  return { linhasDaLista, navegacoes, selects };
};

test('tocar na notificação de convite abre a viagem', async () => {
  // O caminho que quebrou em produção: convite direto (por busca de usuário),
  // que chega SEM token — quem abre a viagem é o `target_id`.
  const { linhasDaLista, navegacoes } = await montarTela([linhaDoBanco()]);

  const [linha] = linhasDaLista();
  assert.ok(linha, 'a notificação de convite precisa aparecer na lista');
  assert.notEqual(
    linha.props.disabled,
    true,
    'a notificação de convite não pode ser um item morto na lista',
  );

  TestRenderer.act(() => { linha.props.onPress(); });

  assert.deepEqual(navegacoes, [{ name: 'AssistantResult', params: { planId: TRIP_ID } }]);
});

test('tocar em "entrou na sua viagem" também abre a viagem', async () => {
  const { linhasDaLista, navegacoes } = await montarTela([
    linhaDoBanco({ type: 'trip_joined', message: 'entrou na sua viagem' }),
  ]);

  TestRenderer.act(() => { linhasDaLista()[0].props.onPress(); });

  assert.deepEqual(navegacoes, [{ name: 'AssistantResult', params: { planId: TRIP_ID } }]);
});

test('a consulta pede toda coluna de que o roteamento depende', async () => {
  // `getRoute` lê colunas diretamente da linha. Pedir uma a menos não quebra a
  // tela: quebra só o toque, em silêncio, e só para um tipo de notificação —
  // que foi o que aconteceu com `target_id` e as três notificações de viagem.
  const { selects } = await montarTela([linhaDoBanco()]);
  const select = selects.find((cols) => String(cols).includes('type'));
  const colunas = colunasPedidas(select);

  ['target_id', 'conversation_id', 'passport_share_id', 'photo_id', 'actor'].forEach((coluna) => {
    assert.ok(colunas.includes(coluna), `o select precisa pedir ${coluna}`);
  });
});

test('notificação sem destino nenhum continua desabilitada', async () => {
  // O outro lado da moeda: `disabled` existe por um motivo. Uma linha órfã (o
  // alvo foi apagado) não pode virar um toque que navega para lugar nenhum.
  const { linhasDaLista } = await montarTela([linhaDoBanco({ target_id: null, actor: null, actor_id: null })]);

  assert.equal(linhasDaLista()[0].props.disabled, true);
});
