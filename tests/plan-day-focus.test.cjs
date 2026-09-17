// O seletor de dia sob o dedo: toque, seta e arrasto numa viagem de 21 dias.
//
// POR QUE ESTE ARQUIVO EXISTE, SENDO QUE JÁ HAVIA TESTE DA FAIXA DE DIAS
//
// O teste anterior afirmava que o conserto tinha sido feito lendo o CÓDIGO-FONTE
// da tela (um `assert.match` procurando a chamada `measureLayout`) e alimentava
// `scrollTargetForDay` com posições escritas à mão, já corretas. Os dois passam
// com o aplicativo quebrado: o primeiro só confirma que uma chamada existe, não
// que ela devolve a régua certa; o segundo testa a conta, e a conta nunca foi o
// problema — o problema eram as POSIÇÕES que chegavam nela.
//
// Aqui a tela inteira é SIMULADA: um ScrollView que trava no fim do conteúdo
// como o de verdade trava, cartões de altura desigual, o bloco de viajantes que
// chega depois e empurra tudo para baixo, e o `measureLayout` devolvendo o que o
// nativo devolve de fato — posição relativa ao quadro VISÍVEL. Aí dá para
// perguntar o que interessa e o que nenhum dos dois testes anteriores
// perguntava: depois de tocar na pílula do dia N, qual dia ficou em foco?
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');

const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const planDayFocus = loadEsm('src/components/map/planDayFocus.js');

const { activeDayFromScroll, scrollTargetForDay, stepDay } = planDayStrip;
const {
  contentOffsetFromMeasure,
  dayFocusReducer,
  initialDayFocus,
  FOCUS_LOCK_MS,
} = planDayFocus;

const DIAS = Array.from({ length: 21 }, (_, i) => i + 1);

/**
 * A tela da viagem, simulada.
 *
 * `medeComoNativo` liga o comportamento real do `measureLayout` contra um
 * ScrollView: a posição vem relativa ao quadro visível, já com a rolagem
 * descontada. É o detalhe que derrubava tudo e que nenhum teste via.
 */
/**
 * @param {{
 *   alturaDoCartao?: (dia: number) => number,
 *   viewport?: number,
 *   cabecalho?: number,
 *   medeComoNativo?: boolean,
 *   usaCorrecao?: boolean,
 *   usaTrava?: boolean,
 * }} [config]
 */
function telaDaViagem({
  alturaDoCartao = (dia) => (dia % 3 === 0 ? 140 : 320),
  viewport = 700,
  cabecalho = 400,
  medeComoNativo = true,
  usaCorrecao = true,
  usaTrava = true,
} = {}) {
  let alturaCabecalho = cabecalho;
  let scrollY = 0;
  let foco = initialDayFocus;
  let agora = 0;
  let offsets = {};

  const topoReal = (dia) => {
    let y = alturaCabecalho;
    for (const d of DIAS) {
      if (d === dia) return y;
      y += alturaDoCartao(d);
    }
    return null;
  };
  const alturaDoConteudo = () =>
    alturaCabecalho + DIAS.reduce((soma, d) => soma + alturaDoCartao(d), 0);
  const rolagemMaxima = () => Math.max(0, alturaDoConteudo() - viewport);

  // O que o measureLayout devolve de verdade.
  const medirCru = (dia) => {
    const topo = topoReal(dia);
    if (topo === null) return null;
    return medeComoNativo ? topo - scrollY : topo;
  };

  const medir = (dia) =>
    usaCorrecao
      ? contentOffsetFromMeasure({ y: medirCru(dia), scrollY, from: 'viewport' })
      : medirCru(dia);

  const remedir = () => {
    offsets = {};
    for (const d of DIAS) {
      const y = medir(d);
      if (Number.isFinite(y)) offsets[d] = y;
    }
  };

  const emitirScroll = () => {
    const dia = activeDayFromScroll(offsets, scrollY);
    if (dia === null) return;
    foco = usaTrava
      ? dayFocusReducer(foco, { type: 'scrolled', day: dia, now: agora })
      : { day: dia, lockUntil: 0 };
  };

  // A rolagem animada não salta: ela emite eventos pelo caminho, e era o ÚLTIMO
  // deles que reescrevia o dia em foco.
  const rolarAte = (y) => {
    const destino = Math.min(Math.max(0, y), rolagemMaxima());
    const partida = scrollY;
    for (let passo = 1; passo <= 6; passo++) {
      agora += 50;
      scrollY = partida + ((destino - partida) * passo) / 6;
      emitirScroll();
    }
    scrollY = destino;
    emitirScroll();
  };

  const escolherDia = (dia) => {
    foco = usaTrava
      ? dayFocusReducer(foco, { type: 'choose', day: dia, now: agora })
      : { day: dia, lockUntil: 0 };

    const medido = medir(dia);
    const mapa = Number.isFinite(medido) ? { [dia]: medido } : offsets;
    const alvo = scrollTargetForDay(mapa, dia);
    if (alvo === null) return;
    rolarAte(alvo);
  };

  return {
    remedir,
    escolherDia,
    /**
     * O toque numa pílula.
     *
     * A faixa desenha TODOS os dias e rola, então qualquer dia é tocável — antes
     * havia aqui uma checagem de "está na janela de cinco", que deixou de fazer
     * sentido quando a janela virou um ScrollView horizontal.
     */
    tocarPilula(dia) {
      escolherDia(dia);
    },
    /** A seta lateral: anda um dia e rola até ele. */
    tocarSeta(direcao) {
      const proximo = stepDay(DIAS, foco.day, direcao);
      if (proximo === null) return null;
      escolherDia(proximo);
      return proximo;
    },
    /** O dedo rolando a tela por conta própria. */
    rolarComODedo(y) {
      foco = dayFocusReducer(foco, { type: 'grabbed', now: agora });
      agora += 50;
      scrollY = Math.min(Math.max(0, y), rolagemMaxima());
      emitirScroll();
    },
    /** O bloco de viajantes chega da consulta e empurra o roteiro para baixo. */
    viajantesChegaram(altura) {
      alturaCabecalho += altura;
      remedir();
    },
    avancarTempo(ms) { agora += ms; },
    get diaEmFoco() { return foco.day; },
    get scrollY() { return scrollY; },
    get rolagemMaxima() { return rolagemMaxima(); },
  };
}

// ---------------------------------------------------------------------------
// 1. A REGRESSÃO: tocar no dia N tem de terminar no dia N
// ---------------------------------------------------------------------------

test('a régua errada é o bug: measureLayout contra o ScrollView já desconta a rolagem', () => {
  // Esta é a falha que sobreviveu à troca de `onLayout` por `measureLayout`, e
  // por isso o conserto anterior não consertou nada. Sem a correção, o segundo
  // toque em diante erra por exatamente a rolagem atual.
  const tela = telaDaViagem({ usaCorrecao: false, usaTrava: false });
  tela.remedir();

  tela.escolherDia(1);
  assert.equal(tela.diaEmFoco, 1, 'no topo da tela a rolagem é zero e o toque acerta');

  tela.escolherDia(3);
  assert.notEqual(
    tela.diaEmFoco,
    3,
    'sem a correção, o toque no dia 3 NÃO pode acertar — se acertar, a simulação parou de reproduzir o bug'
  );

  // E a correção devolve a régua certa.
  assert.equal(contentOffsetFromMeasure({ y: 200, scrollY: 1800 }), 2000);
  assert.equal(contentOffsetFromMeasure({ y: 2000, scrollY: 1800, from: 'content' }), 2000);
  assert.equal(contentOffsetFromMeasure({ y: null, scrollY: 10 }), null);
  assert.equal(contentOffsetFromMeasure({ y: undefined }), null);
});

test('tocar em CADA uma das 21 pílulas deixa em foco o dia que foi tocado', () => {
  // O pedido: primeiro, meio e último — mas não custa cobrir os 21, porque o
  // erro dependia da rolagem acumulada e só aparece a partir do segundo toque.
  const tela = telaDaViagem();
  tela.remedir();

  for (const dia of DIAS) {
    tela.escolherDia(dia);
    assert.equal(
      tela.diaEmFoco,
      dia,
      `toque no dia ${dia} terminou no dia ${tela.diaEmFoco} (scrollY=${tela.scrollY})`
    );
  }
});

test('primeiro, meio e último dia, tocados na pílula', () => {
  // A faixa rola e desenha todos os dias, então o primeiro, o do meio e o último
  // são alcançáveis pelo dedo sem passar por nenhum outro. Quem prova que a
  // pílula existe e responde ao toque é tests/plan-day-tabs-touch.test.cjs, que
  // monta o componente; aqui a pergunta é onde a tela PARA depois do toque.
  const tela = telaDaViagem();
  tela.remedir();

  for (const dia of [1, 11, 21]) {
    tela.tocarPilula(dia);
    assert.equal(tela.diaEmFoco, dia, `a pílula do dia ${dia} levou ao dia ${tela.diaEmFoco}`);
  }
});

test('o ÚLTIMO dia fica em foco mesmo que o ScrollView não consiga rolar até ele', () => {
  // O ScrollView trava em `conteúdo - altura da tela`. O cartão do último dia
  // nunca alcança a linha de leitura, então o scroll-spy, sozinho, SEMPRE
  // devolvia o penúltimo. Nenhuma medida conserta isso: é a escolha que precisa
  // valer mais que a leitura.
  const tela = telaDaViagem();
  tela.remedir();

  tela.escolherDia(21);
  assert.equal(tela.diaEmFoco, 21);
  assert.equal(tela.scrollY, tela.rolagemMaxima, 'a tela rolou até onde dava');

  // Sem a trava, o mesmo cenário devolve o penúltimo — a prova de que a trava é
  // o que resolve, e não um detalhe de estilo.
  const semTrava = telaDaViagem({ usaTrava: false });
  semTrava.remedir();
  semTrava.escolherDia(21);
  assert.notEqual(semTrava.diaEmFoco, 21);
});

test('as setas andam em sequência e cada uma para no dia certo', () => {
  const tela = telaDaViagem();
  tela.remedir();

  tela.escolherDia(1);
  for (let esperado = 2; esperado <= 21; esperado++) {
    const pedido = tela.tocarSeta(1);
    assert.equal(pedido, esperado, `a seta avançar pediu o dia ${pedido}, deveria pedir ${esperado}`);
    assert.equal(
      tela.diaEmFoco,
      esperado,
      `a seta avançar pediu o dia ${esperado} e a tela ficou no ${tela.diaEmFoco}`
    );
  }

  // E de volta, que é onde o erro por rolagem acumulada era maior.
  for (let esperado = 20; esperado >= 1; esperado--) {
    const pedido = tela.tocarSeta(-1);
    assert.equal(pedido, esperado, `a seta voltar pediu o dia ${pedido}, deveria pedir ${esperado}`);
    assert.equal(
      tela.diaEmFoco,
      esperado,
      `a seta voltar pediu o dia ${esperado} e a tela ficou no ${tela.diaEmFoco}`
    );
  }

  // As pontas não dão a volta.
  assert.equal(tela.tocarSeta(-1), null);
});

test('o bloco de viajantes chegando no meio do caminho não desloca o alvo', () => {
  // A consulta dos viajantes responde depois do primeiro layout e empurra o
  // roteiro inteiro para baixo. É o cenário que o comentário da tela cita como
  // motivo do conserto anterior — e que agora é exercitado de fato.
  const tela = telaDaViagem();
  tela.remedir();

  tela.escolherDia(5);
  assert.equal(tela.diaEmFoco, 5);

  tela.viajantesChegaram(260);
  tela.avancarTempo(FOCUS_LOCK_MS);

  for (const dia of [7, 14, 21, 2]) {
    tela.escolherDia(dia);
    assert.equal(tela.diaEmFoco, dia, `depois dos viajantes, o dia ${dia} caiu no ${tela.diaEmFoco}`);
  }
});

test('a capa carregando e encolhendo o cabeçalho também não desloca o alvo', () => {
  // O caso inverso: a foto da capa não carrega e o cabeçalho ENCOLHE. Com
  // posições guardadas, o destaque passava a cair num dia ADIANTE do tocado.
  const tela = telaDaViagem({ cabecalho: 620 });
  tela.remedir();

  tela.escolherDia(9);
  tela.viajantesChegaram(-220);
  tela.avancarTempo(FOCUS_LOCK_MS);

  for (const dia of [3, 12, 21]) {
    tela.escolherDia(dia);
    assert.equal(tela.diaEmFoco, dia, `com o cabeçalho menor, o dia ${dia} caiu no ${tela.diaEmFoco}`);
  }
});

test('cartões curtos não fazem o destaque pular para o dia seguinte', () => {
  // Um dia de descanso rende um cartão de ~120px, menor que a âncora de leitura.
  const tela = telaDaViagem({ alturaDoCartao: () => 110 });
  tela.remedir();

  for (const dia of [1, 4, 11, 18, 21]) {
    tela.escolherDia(dia);
    assert.equal(tela.diaEmFoco, dia, `cartão curto: dia ${dia} caiu no ${tela.diaEmFoco}`);
  }
});

test('depois da escolha, rolar com o dedo devolve o comando ao destaque de leitura', () => {
  // A trava não pode virar uma prisão: quem rola a tela com o dedo está lendo
  // outro dia, e o destaque tem de acompanhar na hora.
  const tela = telaDaViagem();
  tela.remedir();

  tela.escolherDia(11);
  assert.equal(tela.diaEmFoco, 11);

  tela.rolarComODedo(0);
  assert.equal(tela.diaEmFoco, 1, 'rolando para o topo, o dia em leitura é o 1');
});

// ---------------------------------------------------------------------------
// 2. A MÁQUINA DE FOCO, caso a caso
// ---------------------------------------------------------------------------

test('a escolha do usuário cala o scroll-spy, e só pelo tempo da animação', () => {
  let estado = initialDayFocus;

  estado = dayFocusReducer(estado, { type: 'choose', day: 7, now: 1000 });
  assert.equal(estado.day, 7);

  // Todos os eventos da rolagem programática são ignorados.
  for (const y of [2, 3, 4, 5, 6]) {
    estado = dayFocusReducer(estado, { type: 'scrolled', day: y, now: 1100 });
    assert.equal(estado.day, 7);
  }

  // Passado o prazo, o spy volta a mandar — senão o destaque congelaria.
  estado = dayFocusReducer(estado, { type: 'scrolled', day: 9, now: 1000 + FOCUS_LOCK_MS });
  assert.equal(estado.day, 9);
});

test('o fim da rolagem solta a trava antes do prazo', () => {
  let estado = dayFocusReducer(initialDayFocus, { type: 'choose', day: 4, now: 0 });
  estado = dayFocusReducer(estado, { type: 'settled', now: 200 });
  estado = dayFocusReducer(estado, { type: 'scrolled', day: 6, now: 220 });
  assert.equal(estado.day, 6);
});

test('o dedo na lista tem prioridade sobre a trava', () => {
  let estado = dayFocusReducer(initialDayFocus, { type: 'choose', day: 15, now: 0 });
  estado = dayFocusReducer(estado, { type: 'grabbed', now: 10 });
  estado = dayFocusReducer(estado, { type: 'scrolled', day: 2, now: 20 });
  assert.equal(estado.day, 2);
});

test('a máquina de foco ignora o que não é dia', () => {
  const base = dayFocusReducer(initialDayFocus, { type: 'choose', day: 3, now: 0 });
  assert.equal(dayFocusReducer(base, { type: 'choose', day: null, now: 0 }).day, 3);
  assert.equal(dayFocusReducer(base, { type: 'scrolled', day: NaN, now: 9999 }).day, 3);
  assert.equal(dayFocusReducer(base, { type: 'nada' }).day, 3);
  assert.deepEqual(dayFocusReducer(undefined, { type: 'settled' }), initialDayFocus);
});

// ---------------------------------------------------------------------------
// 4. O QUE A TELA E O COMPONENTE PRECISAM ESTAR USANDO
//
// As afirmações acima valem sobre a simulação; estas amarram a simulação ao
// código de verdade, para o conserto não viver só no teste.
// ---------------------------------------------------------------------------

test('a tela da viagem usa a régua corrigida e a máquina de foco', () => {
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  // A medida passa pela função com prazo, que mede contra a view de conteúdo —
  // a régua de `scrollTo`. A conversão de régua (`contentOffsetFromMeasure`)
  // mora dentro dela; ver tests/plan-day-measure.test.cjs.
  assert.match(screen, /measureContentOffset/);
  assert.match(screen, /getInnerViewRef/);
  assert.match(screen, /dayFocusReducer/);
  // E o spy não pode mais escrever o dia direto, por fora da máquina.
  assert.doesNotMatch(screen, /setReadingDay\(/);
});

