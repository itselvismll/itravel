// A medida do cartão, contra o React Native que este projeto realmente usa.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// O teste anterior simulava `measureLayout` como uma função que RESPONDE. O
// React Native 0.83 (arquitetura nova) não responde quando recebe o argumento
// errado — ele sai sem chamar callback nenhum:
//
//     // node_modules/react-native/src/private/webapis/dom/nodes/ReactNativeElement.js
//     measureLayout(relativeToNativeNode, onSuccess, onFail) {
//       if (!(relativeToNativeNode instanceof ReactNativeElement)) {
//         console.error('ref.measureLayout must be called with a ref to a native component');
//         return;          // <- nem onSuccess, nem onFail
//       }
//       ...
//
// `findNodeHandle()` devolve um número, a checagem reprova, e a promessa de quem
// esperava a medida nunca resolvia. O toque na pílula ficava pendurado num
// `await` eterno: nenhuma rolagem, nenhuma reação. O teste passava porque a
// simulação respondia — ela reproduzia a minha suposição, não o aparelho.
//
// Aqui o falso `measureLayout` copia a checagem do React Native de verdade,
// incluindo o caminho que não responde. E o que está sob teste é a MESMA função
// que a tela chama (`measureContentOffset`), não uma cópia dela.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');

const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const planDayFocus = loadEsm('src/components/map/planDayFocus.js');
const { scrollTargetForDay, activeDayFromScroll } = planDayStrip;
const {
  measureContentOffset,
  MEASURE_TIMEOUT_MS,
  dayFocusReducer,
  initialDayFocus,
} = planDayFocus;

const DIAS = Array.from({ length: 21 }, (_, i) => i + 1);

// ---------------------------------------------------------------------------
// O React Native 0.83 de mentira — com a checagem que derrubou a tela
// ---------------------------------------------------------------------------

/** O tipo que o `instanceof` do React Native exige. */
class ReactNativeElement {
  /** @param {number} contentY */
  constructor(contentY) { this.contentY = contentY; }

  /**
   * A cópia fiel de ReactNativeElement.measureLayout.
   *
   * @param {any} relativeToNativeNode
   * @param {(x: number, y: number) => void} onSuccess
   * @param {() => void} [onFail]
   */
  measureLayout(relativeToNativeNode, onSuccess, onFail) {
    if (!(relativeToNativeNode instanceof ReactNativeElement)) {
      // É AQUI que a tela morreu: sai sem chamar nada. `onFail` inclusive está
      // marcado como "currently unused" no próprio react-native.
      return;
    }
    onSuccess(0, this.contentY - relativeToNativeNode.contentY);
  }
}

/** O que `findNodeHandle()` devolve: um número. */
const findNodeHandle = () => 42;

test('o caminho que matou a tela: medir contra um número não responde NADA', async () => {
  const cartao = new ReactNativeElement(2000);

  // Prova primeiro que o falso reproduz o React Native: nenhum callback é chamado.
  let chamou = false;
  cartao.measureLayout(findNodeHandle(), () => { chamou = true; }, () => { chamou = true; });
  assert.equal(chamou, false, 'se isto chamar, o falso parou de reproduzir o RN 0.83');

  // E agora o que importa: mesmo assim a medida TERMINA, pelo prazo. Antes do
  // conserto, esta promessa nunca resolvia e o toque não fazia nada.
  const inicio = Date.now();
  const resultado = await measureContentOffset({
    node: cartao,
    contentNode: findNodeHandle(),
    timeoutMs: 20,
  });

  assert.equal(resultado, null, 'sem resposta, a medida desiste em vez de pendurar');
  assert.ok(Date.now() - inicio < 1000, 'a medida não pode esperar para sempre');
});

test('medindo contra a view de conteúdo, a posição sai certa e em régua de conteúdo', async () => {
  const conteudo = new ReactNativeElement(0);
  const cartao = new ReactNativeElement(2000);

  const y = await measureContentOffset({ node: cartao, contentNode: conteudo });
  assert.equal(y, 2000);

  // E a régua não depende da rolagem: é essa a diferença de medir contra o
  // conteúdo em vez de contra o quadro visível do ScrollView.
  const outro = await measureContentOffset({ node: new ReactNativeElement(5400), contentNode: conteudo });
  assert.equal(outro, 5400);
});

test('a medida se recusa a pendurar em qualquer forma de falha', async () => {
  const conteudo = new ReactNativeElement(0);

  assert.equal(await measureContentOffset({ node: null, contentNode: conteudo }), null);
  assert.equal(await measureContentOffset({ node: {}, contentNode: conteudo }), null);
  assert.equal(await measureContentOffset({ node: new ReactNativeElement(10), contentNode: null }), null);

  // Medida que joga exceção não derruba a tela.
  const explode = { measureLayout: () => { throw new Error('nativo caiu'); } };
  assert.equal(await measureContentOffset({ node: explode, contentNode: conteudo }), null);

  // Callback que chega DUAS vezes não resolve duas vezes.
  const teimoso = {
    measureLayout: (_ancestor, onSuccess) => { onSuccess(0, 100); onSuccess(0, 999); },
  };
  assert.equal(await measureContentOffset({ node: teimoso, contentNode: conteudo }), 100);
});

test('o prazo padrão é curto o bastante para não parecer travamento', () => {
  assert.ok(MEASURE_TIMEOUT_MS <= 500, `${MEASURE_TIMEOUT_MS}ms é tempo demais para um toque`);
});

// ---------------------------------------------------------------------------
// A tela, com a medida real por baixo
// ---------------------------------------------------------------------------

/**
 * A tela do roteiro com o pipeline de medida DE VERDADE.
 *
 * `medidaResponde: false` reproduz o aparelho do relato: a API nativa não
 * responde. A tela precisa rolar assim mesmo, pelas posições do `onLayout`.
 */
function telaDoRoteiro({
  cabecalho = 400,
  viewport = 700,
  alturaDoCartao = (/** @type {number} */ _d) => 300,
  medidaResponde = true,
} = {}) {
  let scrollY = 0;
  let foco = initialDayFocus;
  let agora = 0;
  /** @type {number[]} */
  const rolagens = [];

  const topoNaLista = (dia) => DIAS.slice(0, DIAS.indexOf(dia))
    .reduce((soma, d) => soma + alturaDoCartao(d), 0);
  const topoReal = (dia) => cabecalho + topoNaLista(dia);
  const maxScroll = () => Math.max(
    0,
    cabecalho + DIAS.reduce((s, d) => s + alturaDoCartao(d), 0) - viewport
  );

  const conteudo = new ReactNativeElement(0);
  const nos = Object.fromEntries(DIAS.map((d) => [d, new ReactNativeElement(topoReal(d))]));

  // As posições de reserva, exatamente como a tela as monta: onLayout do cartão
  // (posição na lista) mais onLayout da lista (onde a lista começa).
  const listTop = cabecalho;
  const layoutOffsets = Object.fromEntries(DIAS.map((d) => [d, topoNaLista(d)]));
  const offsetsFromLayout = () => Object.fromEntries(
    Object.entries(layoutOffsets).map(([d, y]) => [d, listTop + Number(y)])
  );

  /** @type {Record<string, number>} */
  let dayOffsets = {};
  const currentOffsets = () => (
    Object.keys(dayOffsets).length ? dayOffsets : offsetsFromLayout()
  );

  const measureDay = (dia) => measureContentOffset({
    node: nos[dia],
    // O nó certo, ou o número do findNodeHandle quando se quer reproduzir a falha.
    contentNode: medidaResponde ? conteudo : findNodeHandle(),
    timeoutMs: 20,
  });

  const refreshDayOffsets = async () => {
    const medidas = await Promise.all(DIAS.map(async (d) => [d, await measureDay(d)]));
    const validas = medidas.filter(([, y]) => Number.isFinite(y));
    if (validas.length) dayOffsets = Object.fromEntries(validas);
  };

  const emitirScroll = () => {
    const dia = activeDayFromScroll(currentOffsets(), scrollY);
    if (dia !== null) foco = dayFocusReducer(foco, { type: 'scrolled', day: dia, now: agora });
  };

  const rolarAte = (y) => {
    const destino = Math.min(Math.max(0, y), maxScroll());
    rolagens.push(destino);
    const partida = scrollY;
    for (let passo = 1; passo <= 6; passo++) {
      agora += 50;
      scrollY = partida + ((destino - partida) * passo) / 6;
      emitirScroll();
    }
    scrollY = destino;
    emitirScroll();
  };

  const scrollToDay = async (dia) => {
    if (dia === null) return;
    foco = dayFocusReducer(foco, { type: 'choose', day: dia, now: agora });
    const medido = await measureDay(dia);
    const offsets = Number.isFinite(medido) ? { [dia]: medido } : currentOffsets();
    const alvo = scrollTargetForDay(offsets, dia);
    if (alvo === null) return;
    rolarAte(alvo);
  };

  return {
    scrollToDay,
    refreshDayOffsets,
    get diaEmFoco() { return foco.day; },
    get rolagens() { return rolagens; },
    alvoIdealDoDia: (dia) => Math.min(Math.max(0, topoReal(dia) - 12), maxScroll()),
  };
}

test('o toque rola até o dia certo quando a medida nativa responde', async () => {
  const tela = telaDoRoteiro();
  await tela.refreshDayOffsets();

  for (const dia of [3, 11, 20, 21, 1]) {
    const antes = tela.rolagens.length;
    await tela.scrollToDay(dia);
    assert.ok(tela.rolagens.length > antes, `o toque no dia ${dia} não rolou nada`);
    assert.equal(tela.rolagens.at(-1), tela.alvoIdealDoDia(dia), `dia ${dia} foi para o lugar errado`);
    assert.equal(tela.diaEmFoco, dia);
  }
});

test('O CASO DO APARELHO: a medida nativa não responde, e o toque rola mesmo assim', async () => {
  // Reproduz o relato ao pé da letra — `findNodeHandle` no lugar do nó, que é o
  // que a tela fazia. Antes: nenhuma reação. Agora: as posições do `onLayout`
  // seguram a rolagem.
  const tela = telaDoRoteiro({ medidaResponde: false });
  await tela.refreshDayOffsets();

  for (const dia of [3, 11, 20, 21]) {
    const antes = tela.rolagens.length;
    await tela.scrollToDay(dia);
    assert.ok(
      tela.rolagens.length > antes,
      `com a medida nativa muda, o toque no dia ${dia} continuou não fazendo nada`
    );
    assert.equal(
      tela.rolagens.at(-1),
      tela.alvoIdealDoDia(dia),
      `a reserva do onLayout levou o dia ${dia} para o lugar errado`
    );
    assert.equal(tela.diaEmFoco, dia);
  }
});

test('o toque termina rápido mesmo quando a medida nunca responde', async () => {
  const tela = telaDoRoteiro({ medidaResponde: false });
  const inicio = Date.now();
  await tela.scrollToDay(20);
  assert.ok(Date.now() - inicio < 2000, 'o toque não pode ficar pendurado esperando o nativo');
  assert.equal(tela.rolagens.length, 1);
});

// ---------------------------------------------------------------------------
// As amarras no código de verdade
// ---------------------------------------------------------------------------

test('a tela não usa mais findNodeHandle para medir', () => {
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  // O BUG QUE ISTO PEGA: `findNodeHandle` devolve um número, e a arquitetura
  // nova recusa números em `measureLayout` sem chamar callback nenhum.
  //
  // A busca é pelo USO, e não pela palavra: o comentário da tela cita
  // `findNodeHandle` de propósito, para explicar por que ele não está lá.
  assert.doesNotMatch(
    screen,
    /import \{[^}]*findNodeHandle/,
    'findNodeHandle não deve nem ser importado'
  );
  assert.doesNotMatch(
    screen,
    /^(?!\s*[/*]).*findNodeHandle\(/m,
    'findNodeHandle não mede nada no RN 0.83'
  );

  // Mede contra a view de conteúdo, que é um nó nativo de verdade.
  assert.match(screen, /getInnerViewRef/);
  assert.match(screen, /measureContentOffset/);
});

test('a tela tem posições de reserva vindas do onLayout', () => {
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  // A rede que impede uma API quebrada de matar o toque de novo.
  assert.match(screen, /listTopRef/);
  assert.match(screen, /layoutOffsetsRef/);
  assert.match(screen, /offsetsFromLayout/);
  // E quem lê posições passa por ela, em vez de ir direto no mapa das medidas.
  assert.match(screen, /currentOffsets\(\)/);
});

test('toda medida da tela passa pela função com prazo', () => {
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  // Nenhuma chamada crua a measureLayout: a única porta é measureContentOffset,
  // que tem prazo. Sem isso, um callback que não vem trava a tela outra vez.
  assert.doesNotMatch(screen, /\.measureLayout\(/);
});

test('o módulo da medida documenta a armadilha, para ninguém reintroduzi-la', () => {
  const modulo = fs.readFileSync(
    path.join(root, 'src/components/map/planDayFocus.js'),
    'utf8'
  );
  assert.match(modulo, /findNodeHandle/);
  assert.match(modulo, /ReactNativeElement/);
});
