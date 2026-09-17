// Quem manda no dia em foco: o dedo do usuário ou a rolagem da tela.
//
// Módulo puro — sem React, sem DOM, sem mapa. Aqui mora a parte que as duas
// telas erravam em silêncio, e que só um teste sem tela consegue afirmar: qual
// dia fica em foco DEPOIS de um toque, de uma seta ou de um arrasto.
//
// AS DUAS FALHAS QUE ESTE ARQUIVO FECHA
//
//   1. A MEDIDA ERA DE OUTRA RÉGUA. `measureLayout(filho, ScrollView)` devolve a
//      posição do cartão relativa ao QUADRO VISÍVEL do ScrollView — ou seja, já
//      com a rolagem atual descontada. Esse número foi usado como se fosse a
//      posição dentro do CONTEÚDO. Com a tela no topo os dois valores coincidem,
//      e por isso o primeiro toque sempre acertava e o conserto pareceu feito;
//      a partir do segundo, todo toque errava por exatamente a rolagem atual.
//      Tocar no dia 3 parava no dia 2, tocar no 11 parava no 9, e as setas
//      desandavam em sequência. `contentOffsetFromMeasure` devolve a régua certa.
//
//   2. O SCROLL-SPY ATROPELAVA A ESCOLHA. A mesma tela destaca o dia lido
//      conforme a pessoa rola. Um toque marcava o dia e logo em seguida mandava
//      rolar; a rolagem disparava os eventos de scroll, e o último deles
//      reescrevia o dia em foco. Quem decidia o destaque não era o toque, era
//      onde a rolagem tinha parado. No FIM da lista isso nunca acerta: o
//      ScrollView não rola além de `conteúdo - altura da tela`, então o último
//      dia não alcança a linha de leitura e o destaque voltava para o penúltimo,
//      sempre. `dayFocusReducer` dá ao toque uma janela de silêncio em que o
//      spy não fala.

/**
 * Por quanto tempo, em ms, a escolha do usuário cala o scroll-spy.
 *
 * É um prazo, e não um "espere o fim da rolagem", porque o fim da rolagem não é
 * confiável: `onMomentumScrollEnd` não dispara para toda rolagem programática no
 * Android nem no react-native-web. Esperar por um evento que pode não vir
 * deixaria o destaque preso no dia escolhido para sempre. 600ms cobre a animação
 * padrão do `scrollTo` com folga, e o evento de fim, quando vem, solta antes.
 */
export const FOCUS_LOCK_MS = 600;

/** @typedef {{ day: number | null, lockUntil: number }} DayFocus */

/** @type {DayFocus} */
export const initialDayFocus = { day: null, lockUntil: 0 };

/**
 * A posição do cartão DENTRO DO CONTEÚDO, a partir de uma medida crua.
 *
 * `measureLayout` contra o ScrollView mede contra o quadro visível dele, então a
 * medida já vem com a rolagem descontada: `visível = conteúdo - scrollY`. Somar
 * a rolagem de volta é o que devolve a posição na régua em que `scrollTo`
 * trabalha. Medindo contra a view de conteúdo (`from: 'content'`) o valor já
 * está na régua certa e nada é somado.
 *
 * @param {{ y: number | null, scrollY?: number, from?: 'viewport' | 'content' }} params
 * @returns {number | null} posição no conteúdo, ou null se a medida falhou
 */
export const contentOffsetFromMeasure = ({ y, scrollY = 0, from = 'viewport' }) => {
  if (!Number.isFinite(y)) return null;
  if (from === 'content') return Number(y);
  const rolagem = Number.isFinite(scrollY) ? Number(scrollY) : 0;
  return Number(y) + rolagem;
};

/**
 * O dia em foco depois de um evento.
 *
 * Só há quatro coisas que mexem no dia em foco, e a ordem de precedência entre
 * elas é a regra inteira:
 *
 *   `choose`  — toque numa pílula, numa seta ou arrasto: manda, e cala o spy;
 *   `scrolled`— o spy leu um dia: só vale fora da janela de silêncio;
 *   `settled` — a rolagem parou: devolve a palavra ao spy;
 *   `grabbed` — o dedo pegou a lista: o usuário assumiu, o spy volta a mandar
 *               na hora, mesmo dentro da janela.
 *
 * @param {DayFocus} state
 * @param {{ type: 'choose' | 'scrolled' | 'settled' | 'grabbed', day?: number | null, now?: number }} action
 * @returns {DayFocus}
 */
export const dayFocusReducer = (state, action) => {
  const atual = state ?? initialDayFocus;
  const now = Number.isFinite(action?.now) ? Number(action.now) : 0;

  switch (action?.type) {
    case 'choose': {
      if (!Number.isFinite(action.day)) return atual;
      return { day: Number(action.day), lockUntil: now + FOCUS_LOCK_MS };
    }
    case 'scrolled': {
      // Dentro da janela de silêncio o spy é ignorado: foi o usuário que
      // escolheu este dia, e a rolagem que está acontecendo é consequência da
      // escolha dele — não uma leitura nova.
      if (now < atual.lockUntil) return atual;
      if (!Number.isFinite(action.day)) return atual;
      if (atual.day === Number(action.day) && atual.lockUntil === 0) return atual;
      return { day: Number(action.day), lockUntil: 0 };
    }
    case 'settled':
      return atual.lockUntil === 0 ? atual : { ...atual, lockUntil: 0 };
    case 'grabbed':
      return atual.lockUntil === 0 ? atual : { ...atual, lockUntil: 0 };
    default:
      return atual;
  }
};

/**
 * Quanto esperar por uma medida nativa antes de desistir dela.
 *
 * Ver `measureContentOffset` para o motivo de isto existir.
 */
export const MEASURE_TIMEOUT_MS = 250;

/**
 * A posição de um cartão dentro do conteúdo do ScrollView, medida no nativo.
 *
 * ESTA FUNÇÃO EXISTE PORQUE A MEDIDA JÁ MATOU A TELA UMA VEZ
 *
 * A versão anterior chamava `node.measureLayout(findNodeHandle(scrollView), ...)`.
 * No React Native 0.83 (arquitetura nova) isso é um beco sem saída:
 *
 *     // ReactNativeElement.js, no próprio react-native
 *     if (!(relativeToNativeNode instanceof ReactNativeElement)) {
 *       console.error('ref.measureLayout must be called with a ref to a native component');
 *       return;   // <- não chama onSuccess NEM onFail
 *     }
 *
 * `findNodeHandle` devolve um NÚMERO, a checagem reprova, e a função sai sem
 * chamar callback nenhum. Quem fez `await` da promessa esperou para sempre: o
 * toque na pílula não rolava a tela nem para o lugar errado — não fazia nada.
 *
 * Duas regras saíram daí, e as duas moram aqui para o teste poder cobrá-las:
 *
 *   1. mede-se contra a view de CONTEÚDO do ScrollView (`getInnerViewRef()`),
 *      que é um nó nativo de verdade. De quebra, o valor já vem na régua que o
 *      `scrollTo` usa — não há rolagem a somar nem a descontar;
 *   2. TODA medida tem prazo. Um callback nativo que não vem devolve `null` e
 *      quem chamou usa as posições de reserva. A tela pode ficar menos precisa;
 *      não pode parar de responder.
 *
 * @param {{
 *   node: any,
 *   contentNode: any,
 *   timeoutMs?: number,
 *   schedule?: (fn: () => void, ms: number) => any,
 *   cancel?: (timer: any) => void,
 * }} params
 * @returns {Promise<number | null>} posição no conteúdo, ou null se não deu
 */
export const measureContentOffset = ({
  node,
  contentNode,
  timeoutMs = MEASURE_TIMEOUT_MS,
  schedule = setTimeout,
  cancel = clearTimeout,
}) => new Promise((resolve) => {
  if (typeof node?.measureLayout !== 'function' || contentNode == null) {
    return resolve(null);
  }

  let respondeu = false;
  const terminar = (valor) => {
    if (respondeu) return;
    respondeu = true;
    resolve(valor);
  };

  const prazo = schedule(() => terminar(null), timeoutMs);
  const concluir = (valor) => { cancel(prazo); terminar(valor); };

  try {
    node.measureLayout(
      contentNode,
      (_x, y) => concluir(contentOffsetFromMeasure({ y, from: 'content' })),
      () => concluir(null)
    );
  } catch {
    // Medida que joga exceção é medida que não respondeu.
    concluir(null);
  }
});

/**
 * Largura de uma pílula mais o vão até a seguinte.
 *
 * Vem de `PILL` (52) + `gap` (6) do PlanDayTabs; mudar lá pede mudar aqui, e o
 * teste cobra os dois.
 */
export const DAY_PILL_PITCH = 58;

/**
 * Para onde rolar a faixa de pílulas para o dia escolhido ficar visível.
 *
 * POR QUE A FAIXA NÃO INTERPRETA MAIS O ARRASTO
 *
 * Houve aqui um `dayFromPan`, que traduzia o deslocamento do dedo em troca de
 * dia: arrastar selecionava o dia que passava sob o dedo, como um swipe de
 * trocar de página. No aparelho ficou errado — arrastar para navegar mudava o
 * dia sem que ninguém tivesse escolhido nada, e o mapa refiltrava no meio do
 * gesto. Arrastar é para CHEGAR perto; escolher é o toque na pílula, e só ele.
 *
 * Então a faixa passou a ser um ScrollView horizontal de verdade, e o arrasto é
 * o do sistema: ele rola, não seleciona. Sobra uma conta — quando a troca de dia
 * vem das SETAS (ou de qualquer lugar que não o dedo na faixa), a pílula
 * escolhida pode estar fora da vista, e a faixa precisa ir até ela. É esta.
 *
 * O dia fica CENTRADO quando dá, e a conta para nas pontas: passar do fim
 * deixaria um vão vazio depois da última pílula.
 *
 * @param {{
 *   days: number[],
 *   day: number | null,
 *   viewportWidth?: number,
 *   pitch?: number,
 *   pillWidth?: number,
 * }} params
 * @returns {number | null} posição horizontal, ou null quando não há o que rolar
 */
export const stripScrollXForDay = ({
  days,
  day,
  viewportWidth = 0,
  pitch = DAY_PILL_PITCH,
  pillWidth = DAY_PILL_PITCH - 6,
}) => {
  const list = days ?? [];
  const index = list.indexOf(Number(day));
  if (index < 0) return null;

  const passo = Number.isFinite(pitch) && pitch > 0 ? Number(pitch) : DAY_PILL_PITCH;
  const largura = Number.isFinite(viewportWidth) ? Number(viewportWidth) : 0;

  // Sem largura medida ainda não há como centrar nada: a faixa fica onde está.
  if (largura <= 0) return null;

  // O conteúdo não tem vão depois da última pílula.
  const conteudo = list.length * passo - (passo - pillWidth);
  const maximo = Math.max(0, conteudo - largura);

  const centroDaPilula = index * passo + pillWidth / 2;
  const alvo = centroDaPilula - largura / 2;

  return Math.min(Math.max(0, alvo), maximo);
};
