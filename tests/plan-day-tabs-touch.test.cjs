// A faixa de dias RENDERIZADA e TOCADA, não lida com expressão regular.
//
// Duas vezes seguidas um conserto desta faixa foi dado por bom porque uma string
// aparecia no arquivo, e duas vezes o aparelho mostrou que não estava. Aqui o
// componente é montado de verdade pelo react-test-renderer, sobre um
// `react-native` de mentira (tests/helpers/fake-react-native.cjs), e o teste
// chama o `onPress` da pílula como o dedo chamaria.
//
// O QUE ISTO COBRE, E O QUE NÃO COBRE
//
// Cobre a ligação entre o toque e o que o componente faz com ele: qual dia sai
// no `onSelect`, o que as setas mandam, para onde a faixa rola. Não cobre o
// reconhecimento de gesto do sistema — não há responder nativo aqui. Por isso o
// "arrastar não seleciona" é provado de duas maneiras: pela ESTRUTURA (não
// existe caminho de código do arrasto até a seleção) e pelo CONTRATO do
// ScrollView horizontal, que é quem cancela o toque quando o gesto vira rolagem.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const React = require('react');
const TestRenderer = require('react-test-renderer');
const { loadEsm } = require('./helpers/load-esm.cjs');
const { makeReactNative, fakeVectorIcons } = require('./helpers/fake-react-native.cjs');

const root = path.resolve(__dirname, '..');

const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const planDayFocus = loadEsm('src/components/map/planDayFocus.js');
const { activeDayFromScroll, scrollTargetForDay } = planDayStrip;
const {
  contentOffsetFromMeasure,
  dayFocusReducer,
  initialDayFocus,
  stripScrollXForDay,
  DAY_PILL_PITCH,
} = planDayFocus;

const DIAS = Array.from({ length: 21 }, (_, i) => i + 1);

// Resolve chave de tradução contra o pt.json do projeto, com interpolação
// %{var} — o mínimo do i18n-js de que este componente depende.
const ptJson = JSON.parse(
  fs.readFileSync(path.join(root, 'src/i18n/locales/pt.json'), 'utf8')
);
const tDoPt = (chave, opcoes = {}) => {
  const valor = String(chave).split('.').reduce((o, k) => (o ?? {})[k], ptJson);
  if (typeof valor !== 'string') throw new Error('chave inexistente no pt.json: ' + chave);
  return valor.replace(/%\{(\w+)\}/g, (_, nome) => String(opcoes[nome] ?? ''));
};

/** Monta a faixa e devolve o que o teste precisa para tocar nela. */
const montarFaixa = (props) => {
  const rn = makeReactNative();
  const { default: PlanDayTabs } = loadEsm(
    'src/components/map/PlanDayTabs.js',
    {
      react: React,
      'react-native': rn.module,
      '@expo/vector-icons': fakeVectorIcons,
      './planRoute': { dayColor: (day) => `#00000${day % 10}` },
      './planDayStrip': planDayStrip,
      './planDayFocus': planDayFocus,
      '../../i18n/LocaleProvider': { useLocale: () => ({ t: tDoPt }) },
    },
    { jsx: true }
  );

  let renderer;
  TestRenderer.act(() => {
    renderer = TestRenderer.create(React.createElement(PlanDayTabs, props));
  });

  const atualizar = (novos) => {
    TestRenderer.act(() => {
      renderer.update(React.createElement(PlanDayTabs, { ...props, ...novos }));
    });
  };

  /** Todas as pílulas de dia, na ordem em que estão desenhadas. */
  const pilulas = () => renderer.root
    .findAll((node) => node.type === 'TouchableOpacity'
      && typeof node.props.accessibilityState?.selected === 'boolean');

  /** A pílula de um dia, achada pelo número que ela mostra. */
  const pilulaDoDia = (dia) => pilulas().find((node) => {
    const textos = node.findAll((filho) => filho.type === 'Text');
    return textos.some((t) => String(t.props.children) === String(dia));
  });

  const setas = () => renderer.root
    .findAll((node) => node.type === 'TouchableOpacity'
      && typeof node.props.accessibilityLabel === 'string'
      && /dia/i.test(node.props.accessibilityLabel)
      && node.props.accessibilityState === undefined);

  return {
    renderer,
    atualizar,
    pilulas,
    pilulaDoDia,
    scrollCalls: rn.scrollCalls,
    /** O dedo tocando a pílula do dia. */
    tocarNoDia(dia) {
      const pilula = pilulaDoDia(dia);
      assert.ok(pilula, `a pílula do dia ${dia} não está desenhada`);
      TestRenderer.act(() => { pilula.props.onPress(); });
    },
    tocarSeta(direcao) {
      const lista = setas();
      const alvo = direcao > 0
        ? lista.find((n) => /pr[óo]ximo/i.test(n.props.accessibilityLabel))
        : lista.find((n) => /anterior/i.test(n.props.accessibilityLabel));
      assert.ok(alvo, 'a seta não está desenhada');
      TestRenderer.act(() => { alvo.props.onPress(); });
    },
    /** A faixa ganha largura na tela, que é o que destrava a rolagem automática. */
    medirFaixa(largura) {
      const scroll = renderer.root.findAll((node) => node.type === 'ScrollView')[0];
      TestRenderer.act(() => {
        scroll.props.onLayout({ nativeEvent: { layout: { width: largura } } });
      });
    },
    scrollViewProps() {
      return renderer.root.findAll((node) => node.type === 'ScrollView')[0].props;
    },
  };
};

// ---------------------------------------------------------------------------
// (a) ARRASTAR SOZINHO NÃO MUDA O DIA
// ---------------------------------------------------------------------------

test('(a) a faixa é um ScrollView horizontal de verdade — o arrasto é do sistema', () => {
  const escolhas = [];
  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: 5,
    onSelect: (day) => escolhas.push(day),
  });

  const scroll = faixa.scrollViewProps();
  assert.equal(scroll.horizontal, true, 'a faixa precisa rolar na horizontal');

  // Montar, medir e rolar a faixa não escolhe dia nenhum: quem escolhe é o
  // toque, e nenhum toque aconteceu.
  faixa.medirFaixa(300);
  assert.deepEqual(escolhas, [], 'nada além do toque pode escolher um dia');
});

test('(a) NÃO existe caminho de código do arrasto até a seleção', () => {
  // Esta é a prova estrutural, e ela é forte justamente por ser negativa: o
  // componente não tem como mudar o dia durante um arrasto porque não há nenhum
  // manipulador de gesto que chame `onSelect`.
  //
  // O BUG QUE ISTO PEGA: a versão anterior lia o arrasto com PanResponder e
  // chamava `onSelect` a cada quadro do gesto — arrastar para navegar trocava o
  // dia sozinho, e no mapa refiltrava o roteiro no meio do movimento.
  const source = fs.readFileSync(
    path.join(root, 'src/components/map/PlanDayTabs.js'),
    'utf8'
  );

  assert.doesNotMatch(source, /PanResponder/, 'o gesto não é mais interpretado à mão');
  assert.doesNotMatch(source, /onPanResponder/);
  assert.doesNotMatch(source, /dayFromPan/, 'a tradução de arrasto em dia não existe mais');
  assert.doesNotMatch(source, /gesture\.dx/);

  // E `onSelect` só é chamado de dois lugares: o toque na pílula e as setas.
  // A contagem ignora comentários — o cabeçalho do componente cita `onSelect`
  // ao documentar o caminho do dia, e citação não é chamada.
  const chamadas = source
    .split(/\r?\n/)
    .filter((linha) => !/^\s*(\/\/|\*|\/\*)/.test(linha))
    .filter((linha) => /onSelect\(/.test(linha));
  assert.equal(
    chamadas.length,
    2,
    `onSelect é chamado ${chamadas.length}x; esperado 2 (pílula e seta):\n${chamadas.join('\n')}`
  );

  // A faixa rola pelo ScrollView, não por gesto próprio.
  assert.match(source, /<ScrollView[\s\S]{0,200}horizontal/);
});

test('(a) a função que traduzia arrasto em dia foi removida do módulo puro', () => {
  assert.equal(planDayFocus.dayFromPan, undefined, 'dayFromPan precisa ter sido removida');
  assert.equal(planDayFocus.DAY_PAN_PITCH, undefined);
});

// ---------------------------------------------------------------------------
// (b) SOLTAR SOBRE UMA PÍLULA SELECIONA AQUELE DIA
// ---------------------------------------------------------------------------

test('(b) tocar numa pílula seleciona exatamente aquele dia', () => {
  const escolhas = [];
  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: 1,
    onSelect: (day) => escolhas.push(day),
  });

  // Todos os 21 dias estão desenhados — a faixa rola, então não há mais janela
  // de cinco recortando a lista.
  assert.equal(faixa.pilulas().length, 21);

  for (const dia of [1, 2, 11, 20, 21]) {
    escolhas.length = 0;
    faixa.tocarNoDia(dia);
    assert.deepEqual(
      escolhas,
      [dia === 1 ? null : dia],
      `o toque no dia ${dia} mandou ${JSON.stringify(escolhas)}`
    );
  }
});

test('(b) no globo, tocar no dia já escolhido desmarca — é o "mostrar tudo"', () => {
  const escolhas = [];
  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: 7,
    onSelect: (day) => escolhas.push(day),
  });

  faixa.tocarNoDia(7);
  assert.deepEqual(escolhas, [null], 'sem isso não haveria como voltar a ver a viagem inteira');
});

test('(b) no roteiro, tocar no dia já em foco NÃO desmarca — ele rola até ele de novo', () => {
  // O BUG QUE ISTO PEGA: na tela de detalhe da viagem o clique na pílula não
  // fazia NADA. Para ver a pílula do dia 20 é preciso ter rolado até perto do dia
  // 20, e é isso que deixa essa pílula em destaque; o toque nela mandava `null`,
  // e a tela do roteiro descarta `null` porque "desrolar" não significa nada.
  const escolhas = [];
  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: 20,
    deselectable: false,
    onSelect: (day) => escolhas.push(day),
  });

  faixa.tocarNoDia(20);
  assert.deepEqual(escolhas, [20], 'o dia em foco precisa ser reenviado, nunca null');
});

test('(b) nenhum toque na faixa do roteiro consegue produzir null', () => {
  // A garantia geral: em papel de índice, `null` não pode sair de lugar nenhum.
  const escolhas = [];
  for (const focado of [null, 1, 11, 21]) {
    const faixa = montarFaixa({
      days: DIAS,
      selectedDay: focado,
      deselectable: false,
      onSelect: (day) => escolhas.push(day),
    });
    for (const dia of DIAS) faixa.tocarNoDia(dia);
  }

  assert.equal(escolhas.length, 21 * 4);
  assert.ok(
    escolhas.every((day) => Number.isFinite(day)),
    'alguma combinação ainda produz null e o toque morreria na tela do roteiro'
  );
});

// ---------------------------------------------------------------------------
// A INVARIANTE DE UNIDADE: o que a pílula ESCREVE é o que ela ENTREGA
//
// Esta é a trava contra a família inteira de "dia errado". Quatro vezes o mesmo
// sintoma voltou de formas diferentes, e a última não estava em conta nenhuma de
// scroll: a pílula escrevia o dia do MÊS e carregava o dia da VIAGEM. Enquanto
// o número desenhado e o número entregue forem o mesmo, o sintoma não tem por
// onde voltar.
// ---------------------------------------------------------------------------

/** O número que a pílula desenha, lido da árvore renderizada. */
const numeroEscrito = (pilula) => {
  const textos = pilula.findAll((n) => n.type === 'Text');
  return textos.map((t) => String(t.props.children)).at(-1);
};

test('o número escrito na pílula é exatamente o dia que o toque entrega', () => {
  // Viagem começando em 2 de outubro: é o caso do relato. Com o rótulo em dia do
  // mês, a pílula do dia 3 saía escrita "4" — deslocamento de -1 constante.
  const dayInfo = Object.fromEntries(
    DIAS.map((d) => [d, { date: `2026-10-${String(d + 1).padStart(2, '0')}`, place: '' }])
  );

  const escolhas = [];
  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: null,
    deselectable: false,
    dayInfo,
    onSelect: (day) => escolhas.push(day),
  });

  for (const pilula of faixa.pilulas()) {
    const escrito = numeroEscrito(pilula);
    escolhas.length = 0;
    TestRenderer.act(() => { pilula.props.onPress(); });
    assert.equal(
      String(escolhas[0]),
      escrito,
      `a pílula escrita "${escrito}" entregou o dia ${escolhas[0]}`
    );
  }
});

test('o mesmo, em viagens que começam em qualquer dia do mês', () => {
  // Um deslocamento de -1 só aparece quando a viagem começa no dia 2. Varrer
  // vários inícios garante que não é o caso particular que está passando.
  for (const inicio of [1, 2, 5, 17, 28]) {
    const dayInfo = Object.fromEntries(DIAS.map((d) => {
      const data = new Date(Date.UTC(2026, 9, inicio + d - 1));
      return [d, { date: data.toISOString().slice(0, 10), place: '' }];
    }));

    const escolhas = [];
    const faixa = montarFaixa({
      days: DIAS,
      selectedDay: null,
      deselectable: false,
      dayInfo,
      onSelect: (day) => escolhas.push(day),
    });

    for (const pilula of faixa.pilulas()) {
      const escrito = numeroEscrito(pilula);
      escolhas.length = 0;
      TestRenderer.act(() => { pilula.props.onPress(); });
      assert.equal(
        String(escolhas[0]),
        escrito,
        `viagem começando dia ${inicio}: pílula "${escrito}" entregou ${escolhas[0]}`
      );
    }
  }
});

test('a faixa desenha os 21 dias da viagem, numerados de 1 a 21', () => {
  const dayInfo = Object.fromEntries(
    DIAS.map((d) => [d, { date: `2026-10-${String(d + 1).padStart(2, '0')}`, place: '' }])
  );
  const faixa = montarFaixa({ days: DIAS, selectedDay: null, dayInfo, onSelect: () => {} });

  assert.deepEqual(
    faixa.pilulas().map(numeroEscrito),
    DIAS.map(String),
    'os números desenhados precisam ser os dias da viagem, não datas do calendário'
  );
});

// ---------------------------------------------------------------------------
// (c) O TOQUE NA TELA DE DETALHE DA VIAGEM ROLA ATÉ O DIA CERTO
// ---------------------------------------------------------------------------

/**
 * A tela do roteiro, com a faixa DE VERDADE montada dentro dela.
 *
 * O caminho é o inteiro: o dedo toca a pílula → o componente decide o que mandar
 * no `onSelect` → a tela mede, converte a régua e rola. É onde os dois bugs
 * moravam, cada um numa ponta.
 */
function telaDoRoteiro({
  cabecalho = 400,
  viewport = 700,
  alturaDoCartao = (/** @type {number} */ _dia) => 300,
} = {}) {
  let scrollY = 0;
  let foco = initialDayFocus;
  let agora = 0;
  let offsets = {};
  /** @type {number[]} */
  const rolagens = [];

  const topoReal = (dia) => cabecalho + DIAS.slice(0, DIAS.indexOf(dia))
    .reduce((soma, d) => soma + alturaDoCartao(d), 0);
  const maxScroll = () => Math.max(
    0,
    cabecalho + DIAS.reduce((s, d) => s + alturaDoCartao(d), 0) - viewport
  );

  // measureLayout como o nativo faz: relativo ao quadro VISÍVEL.
  const medir = (dia) => contentOffsetFromMeasure({
    y: topoReal(dia) - scrollY,
    scrollY,
    from: 'viewport',
  });

  const remedir = () => {
    offsets = {};
    for (const d of DIAS) offsets[d] = medir(d);
  };
  remedir();

  const emitirScroll = () => {
    const dia = activeDayFromScroll(offsets, scrollY);
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

  // É o `scrollToDay` da tela, com a mesma ordem de operações.
  const scrollToDay = (day) => {
    if (day === null) return; // a tela descarta null — é o que ela faz de verdade
    foco = dayFocusReducer(foco, { type: 'choose', day, now: agora });
    const medido = medir(day);
    const alvo = scrollTargetForDay(
      Number.isFinite(medido) ? { [day]: medido } : offsets,
      day
    );
    if (alvo === null) return;
    rolarAte(alvo);
  };

  return {
    scrollToDay,
    get diaEmFoco() { return foco.day; },
    get scrollY() { return scrollY; },
    get rolagens() { return rolagens; },
    alvoIdealDoDia: (dia) => Math.min(Math.max(0, topoReal(dia) - 12), maxScroll()),
  };
}

test('(c) toque na pílula na TELA DE DETALHE rola até o dia certo', () => {
  const tela = telaDoRoteiro();

  // A faixa montada exatamente como a tela do roteiro a monta.
  let faixa = montarFaixa({
    days: DIAS,
    selectedDay: tela.diaEmFoco,
    deselectable: false,
    onSelect: (day) => (day === null ? null : tela.scrollToDay(day)),
  });

  for (const dia of [3, 11, 20, 21, 1]) {
    const antes = tela.rolagens.length;

    // A faixa é remontada com o dia em foco atual, como a tela re-renderiza.
    faixa = montarFaixa({
      days: DIAS,
      selectedDay: tela.diaEmFoco,
      deselectable: false,
      onSelect: (day) => (day === null ? null : tela.scrollToDay(day)),
    });
    faixa.tocarNoDia(dia);

    assert.ok(
      tela.rolagens.length > antes,
      `o toque no dia ${dia} não gerou rolagem nenhuma`
    );
    assert.equal(
      tela.rolagens[tela.rolagens.length - 1],
      tela.alvoIdealDoDia(dia),
      `o toque no dia ${dia} rolou para o lugar errado`
    );
    assert.equal(tela.diaEmFoco, dia, `o toque no dia ${dia} deixou o dia ${tela.diaEmFoco} em foco`);
  }
});

test('(c) o caso do dia 20 relatado: tocar na pílula em destaque rola', () => {
  // Reproduz o relato ao pé da letra: a pessoa rolou até o dia 20, o que deixa a
  // pílula do 20 em destaque, e tocou nela. Antes: nada acontecia.
  const tela = telaDoRoteiro();
  tela.scrollToDay(20);
  assert.equal(tela.diaEmFoco, 20, 'pré-condição: a leitura está no dia 20');

  const rolagensAntes = tela.rolagens.length;

  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: 20,
    deselectable: false,
    onSelect: (day) => (day === null ? null : tela.scrollToDay(day)),
  });
  faixa.tocarNoDia(20);

  assert.ok(
    tela.rolagens.length > rolagensAntes,
    'o toque na pílula do dia 20 continuou não fazendo nada'
  );
  assert.equal(tela.diaEmFoco, 20);
});

test('(c) sem deselectable={false}, o mesmo toque morre — a prova de que é essa a causa', () => {
  const tela = telaDoRoteiro();
  tela.scrollToDay(20);
  const rolagensAntes = tela.rolagens.length;

  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: 20,
    // deselectable fica no padrão (true), que é o do globo
    onSelect: (day) => (day === null ? null : tela.scrollToDay(day)),
  });
  faixa.tocarNoDia(20);

  assert.equal(
    tela.rolagens.length,
    rolagensAntes,
    'se isto rolar, a causa do bug era outra e o conserto está no lugar errado'
  );
});

test('(c) a tela do roteiro passa deselectable={false} para a faixa', () => {
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );
  assert.match(screen, /deselectable=\{false\}/);

  // E o globo NÃO passa: lá o desmarcar é o "mostrar a viagem inteira".
  const globe = fs.readFileSync(path.join(root, 'src/screens/map/GlobeScreen.js'), 'utf8');
  assert.doesNotMatch(globe, /deselectable/);
});

// ---------------------------------------------------------------------------
// AS SETAS, E A FAIXA INDO ATRÁS DA PÍLULA ESCOLHIDA
// ---------------------------------------------------------------------------

test('as setas continuam andando um dia por vez', () => {
  const escolhas = [];
  const faixa = montarFaixa({
    days: DIAS,
    selectedDay: 10,
    onSelect: (day) => escolhas.push(day),
  });

  faixa.tocarSeta(1);
  faixa.tocarSeta(-1);
  assert.deepEqual(escolhas, [11, 9]);
});

test('a seta não dá a volta nas pontas', () => {
  const escolhas = [];
  montarFaixa({ days: DIAS, selectedDay: 21, onSelect: (d) => escolhas.push(d) }).tocarSeta(1);
  assert.deepEqual(escolhas, [], 'a seta na ponta não pode saltar para o começo');

  montarFaixa({ days: DIAS, selectedDay: 1, onSelect: (d) => escolhas.push(d) }).tocarSeta(-1);
  assert.deepEqual(escolhas, []);
});

test('a faixa rola sozinha até a pílula escolhida quando a escolha vem das setas', () => {
  // A pílula do dia 21 está fora da vista numa faixa de 300px. Se a faixa não
  // for atrás dela, a seta destaca um dia que ninguém vê.
  const faixa = montarFaixa({ days: DIAS, selectedDay: 1, onSelect: () => {} });
  faixa.medirFaixa(300);
  faixa.scrollCalls.length = 0;

  faixa.atualizar({ selectedDay: 21 });

  assert.equal(faixa.scrollCalls.length, 1, 'a faixa não foi atrás do dia escolhido');
  const esperado = stripScrollXForDay({
    days: DIAS,
    day: 21,
    viewportWidth: 300,
    pitch: DAY_PILL_PITCH,
    pillWidth: 52,
  });
  assert.equal(faixa.scrollCalls[0].x, esperado);
});

test('sem largura medida, a faixa não tenta rolar para lugar nenhum', () => {
  const faixa = montarFaixa({ days: DIAS, selectedDay: 1, onSelect: () => {} });
  faixa.atualizar({ selectedDay: 15 });
  assert.deepEqual(faixa.scrollCalls, [], 'rolar antes de medir mandaria a faixa para um x inventado');
});

// ---------------------------------------------------------------------------
// A CONTA DA ROLAGEM DA FAIXA
// ---------------------------------------------------------------------------

test('a pílula escolhida fica centrada, e a conta para nas pontas', () => {
  const base = { days: DIAS, viewportWidth: 300, pitch: DAY_PILL_PITCH, pillWidth: 52 };

  // No começo não há para onde recuar.
  assert.equal(stripScrollXForDay({ ...base, day: 1 }), 0);
  assert.equal(stripScrollXForDay({ ...base, day: 2 }), 0);

  // No meio, centrada.
  const meio = stripScrollXForDay({ ...base, day: 11 });
  assert.equal(meio, 10 * DAY_PILL_PITCH + 26 - 150);

  // No fim, encostada no fim do conteúdo — sem vão depois da última pílula.
  const conteudo = 21 * DAY_PILL_PITCH - 6;
  assert.equal(stripScrollXForDay({ ...base, day: 21 }), conteudo - 300);

  // Viagem curta que cabe inteira: não há o que rolar.
  assert.equal(stripScrollXForDay({ days: [1, 2, 3], day: 3, viewportWidth: 300 }), 0);
});

test('a conta se recusa a chutar quando falta informação', () => {
  assert.equal(stripScrollXForDay({ days: DIAS, day: null, viewportWidth: 300 }), null);
  assert.equal(stripScrollXForDay({ days: DIAS, day: 99, viewportWidth: 300 }), null);
  assert.equal(stripScrollXForDay({ days: DIAS, day: 3, viewportWidth: 0 }), null);
  assert.equal(stripScrollXForDay({ days: [], day: 1, viewportWidth: 300 }), null);
});

test('o passo da faixa acompanha a largura real da pílula', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/components/map/PlanDayTabs.js'),
    'utf8'
  );
  const pill = Number(/const PILL = (\d+)/.exec(source)?.[1]);
  const gap = Number(/stripContent: \{[\s\S]{0,300}?gap: (\d+)/.exec(source)?.[1]);

  assert.ok(Number.isFinite(pill) && Number.isFinite(gap), 'não deu para ler PILL/gap');
  assert.equal(DAY_PILL_PITCH, pill + gap);
});
