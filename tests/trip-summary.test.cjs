// A capa da viagem: os números que ela mostra e os casos em que não há número
// nenhum para mostrar.
//
// Módulo puro, então o teste roda sem tela e sem banco — e é onde ficam os casos
// que a tela sozinha esconderia: a viagem sem data de início (comum: o
// planejador aceita "quero 5 dias" sem escolher quando), o "1 viajantes", a
// viagem que começa e termina no mesmo dia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');

const dateUtils = loadEsm('src/utils/dateUtils.js');
const tripSummary = loadEsm('src/utils/tripSummary.js', { './dateUtils': dateUtils });
const { countPlanStops, tripChips, tripDurationDays } = tripSummary;

test('a duração vem dos dias do roteiro quando eles existem', () => {
  // É o que está desenhado na tela — ele manda sobre o que foi pedido.
  assert.equal(tripDurationDays({ planDays: 21, startDate: '2026-10-01', endDate: '2026-10-05' }), 21);
});

test('sem roteiro, a duração sai das datas — e o mesmo dia conta como um dia', () => {
  assert.equal(tripDurationDays({ startDate: '2026-10-01', endDate: '2026-10-05' }), 5);
  // Ida e volta no mesmo dia dura um dia, não zero.
  assert.equal(tripDurationDays({ startDate: '2026-10-01', endDate: '2026-10-01' }), 1);
});

test('duração impossível ou ausente devolve null, não um número inventado', () => {
  assert.equal(tripDurationDays({ startDate: '2026-10-05', endDate: '2026-10-01' }), null);
  assert.equal(tripDurationDays({ startDate: '2026-10-01' }), null);
  assert.equal(tripDurationDays({}), null);
  assert.equal(tripDurationDays(), null);
  assert.equal(tripDurationDays({ startDate: 'ontem', endDate: 'hoje' }), null);
});

test('as paradas são atividades, não coordenadas', () => {
  const plan = {
    days: [
      { day: 1, activities: [{ title: 'A' }, { title: 'B' }] },
      // Um voo não tem pino no mapa, mas é uma parada do dia.
      { day: 2, activities: [{ title: 'Voo' }] },
      { day: 3 },
    ],
  };

  assert.equal(countPlanStops(plan), 3);
  assert.equal(countPlanStops({ days: [] }), 0);
  assert.equal(countPlanStops(null), 0);
});

test('os chips saem na ordem da capa, em português e no plural certo', () => {
  const chips = tripChips({
    startDate: '2026-09-15',
    durationDays: 1,
    travelers: 1,
    stops: 21,
  });

  assert.deepEqual(chips.map((chip) => chip.id), ['date', 'duration', 'travelers', 'stops']);
  assert.equal(chips[0].label, '15/09/2026');
  // O plural é o detalhe que denuncia software mal-acabado: "1 dias".
  assert.equal(chips[1].label, '1 dia');
  assert.equal(chips[2].label, '1 viajante');
  assert.equal(chips[3].label, '21 paradas');
});

test('chip sem dado não entra — nem como travessão, nem como zero', () => {
  // Viagem sem data de início é caso comum: o planejador aceita "quero 5 dias"
  // sem escolher quando. Ela mostra três chips, não quatro com um vazio.
  const semData = tripChips({ durationDays: 5, travelers: 2, stops: 12 });
  assert.deepEqual(semData.map((chip) => chip.id), ['duration', 'travelers', 'stops']);

  // Roteiro que falhou na geração não tem parada: melhor não ter o chip do que
  // anunciar "0 paradas".
  const semRoteiro = tripChips({ startDate: '2026-09-15', travelers: 1, stops: 0 });
  assert.deepEqual(semRoteiro.map((chip) => chip.id), ['date', 'travelers']);

  assert.deepEqual(tripChips(), []);
  assert.deepEqual(tripChips({}), []);
});

// ── O que a tela precisa garantir ────────────────────────────────────────────

test('a lista de viajantes desambigua a FK para profiles', () => {
  // O BUG QUE ISTO PEGA: trip_members tem DUAS chaves estrangeiras para profiles
  // (`user_id` e `invited_by`). Sem dizer qual, o PostgREST recusa a consulta
  // inteira com PGRST201 — o mesmo erro que já esvaziou a tela de roteiros
  // salvos uma vez.
  const service = fs.readFileSync(path.join(root, 'src/services/tripMemberService.js'), 'utf8');

  assert.match(service, /profiles!trip_members_user_id_fkey/);
  assert.doesNotMatch(service, /\n\s+profiles \(/);

  // Roteiro não salvo (ou `local-`) não vai ao banco: não há participante para
  // buscar e a consulta só devolveria erro.
  assert.match(service, /String\(tripId\)\.startsWith\('local-'\)/);
});

test('a capa usa expo-image, não o Image do React Native', () => {
  // `Image` do RN não tem cache em disco: a foto de 900px desceria de novo a
  // cada abertura da viagem, no plano de dados de quem está viajando.
  const cover = fs.readFileSync(path.join(root, 'src/components/trip/TripCoverHeader.js'), 'utf8');

  assert.match(cover, /import \{ Image \} from 'expo-image'/);
  assert.match(cover, /cachePolicy="memory-disk"/);
  // O que não pode existir é `Image` vindo do react-native — a import dele é
  // que traria o componente sem cache.
  assert.doesNotMatch(cover, /import \{[^}]*\bImage\b[^}]*\} from 'react-native'/);
});

test('a lista de viajantes já nasce plural, e sem botão de convite', () => {
  const list = fs.readFileSync(path.join(root, 'src/components/trip/TripTravelers.js'), 'utf8');

  // Ela lê uma LISTA e mostra papel — é o que a Fase 2 vai preencher sem
  // precisar mexer na tela de novo.
  assert.match(list, /members\.map/);
  assert.match(list, /ROLE_LABEL/);
  // E não oferece um convite que ainda não existe: nada de botão nem de
  // callback de convite (o texto "convite pendente" de um membro é outra coisa).
  assert.doesNotMatch(list, /onInvite|TouchableOpacity|>Convidar</);
});

// ── Viagem com mais de um destino ────────────────────────────────────────────

test('o título junta os destinos como se escreve em português', () => {
  const { destinationTitle } = tripSummary;

  assert.equal(destinationTitle([{ name: 'Itália' }]), 'Itália');
  assert.equal(destinationTitle([{ name: 'Itália' }, { name: 'Croácia' }]), 'Itália e Croácia');
  assert.equal(
    destinationTitle([{ name: 'Itália' }, { name: 'Croácia' }, { name: 'Eslováquia' }]),
    'Itália, Croácia e Eslováquia'
  );
});

test('do quarto destino em diante, o resto vira contagem', () => {
  const { destinationTitle } = tripSummary;

  // "Itália, Croácia, Eslováquia e Hungria" estoura o título mesmo em duas
  // linhas; "+2" diz quantos são sem tentar caber.
  assert.equal(
    destinationTitle([
      { name: 'Itália' }, { name: 'Croácia' }, { name: 'Eslováquia' }, { name: 'Hungria' },
    ]),
    'Itália, Croácia +2'
  );
});

test('sem lista de destinos, vale o que houver — e nomes vazios não contam', () => {
  const { destinationTitle } = tripSummary;

  // O planejador grava `destination` como string já juntada por vírgula.
  assert.equal(destinationTitle(null, 'Itália, Croácia'), 'Itália, Croácia');
  assert.equal(destinationTitle([], 'Paris'), 'Paris');
  assert.equal(destinationTitle([{ name: '  ' }, { name: '' }], 'Paris'), 'Paris');
  assert.equal(destinationTitle(['Itália', 'Croácia']), 'Itália e Croácia');
  assert.equal(destinationTitle(null, ''), '');
});

// ── O índice de dias dentro do roteiro ───────────────────────────────────────

const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const { activeDayFromScroll } = planDayStrip;

test('o dia destacado acompanha a leitura', () => {
  const offsets = { 1: 0, 2: 800, 3: 1600, 4: 2400 };

  // No topo, o primeiro dia.
  assert.equal(activeDayFromScroll(offsets, 0), 1);
  // A seção "vira" antes de encostar no topo: a âncora é o que faz o dia 2
  // assumir quando o título dele já está na tela.
  assert.equal(activeDayFromScroll(offsets, 700), 2);
  assert.equal(activeDayFromScroll(offsets, 1500), 3);
  // Passou do último: continua no último, não volta para null.
  assert.equal(activeDayFromScroll(offsets, 9000), 4);
});

test('sem nada medido ainda, não há dia em leitura', () => {
  assert.equal(activeDayFromScroll({}, 100), null);
  assert.equal(activeDayFromScroll(null, 100), null);
  // Medida inválida é ignorada em vez de virar dia zero.
  assert.equal(activeDayFromScroll({ 1: 0, 2: NaN }, 5000), 1);
});

test('a ordem das medidas não importa — elas chegam conforme o layout', () => {
  // `onLayout` dispara na ordem em que o React termina cada cartão, que não é
  // necessariamente a ordem dos dias.
  const offsets = { 3: 1600, 1: 0, 2: 800 };
  assert.equal(activeDayFromScroll(offsets, 1500), 3);
});

test('a busca da capa usa UM destino, não o título da viagem', () => {
  const { coverSearchTerm } = tripSummary;

  // O BUG QUE ISTO PEGA: a capa passou a buscar pelo título combinado
  // ("Itália, Croácia e Eslováquia"). O Wikimedia devolve ZERO resultado para
  // a frase inteira, e a viagem ficava sem foto nenhuma.
  assert.equal(
    coverSearchTerm([{ name: 'Itália' }, { name: 'Croácia' }, { name: 'Eslováquia' }]),
    'Itália'
  );

  // Sem lista, vale o primeiro pedaço até a vírgula — que é como o planejador
  // grava `destination` com vários países, e também resolve "Paris, França".
  assert.equal(coverSearchTerm(null, 'Itália, Croácia, Eslováquia'), 'Itália');
  assert.equal(coverSearchTerm(null, 'Paris, França'), 'Paris');
  assert.equal(coverSearchTerm([], 'Paris'), 'Paris');
  assert.equal(coverSearchTerm(null, ''), '');
});

test('a tela da viagem navega para a aba do globo pela rota certa', () => {
  // O BUG QUE ISTO PEGA: `navigate('Map')` não encontrava rota nenhuma, porque
  // esta tela vive no stack RAIZ e a aba do globo vive dentro de "Main". O
  // toque no botão simplesmente não fazia nada.
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  assert.match(screen, /navigation\.navigate\('Main', \{ screen: 'Map' \}\)/);
  assert.doesNotMatch(screen, /navigation\.navigate\('Map'\)/);
});

test('a posição do dia é medida na hora, e na régua do conteúdo', () => {
  // O BUG QUE ISTO PEGA: a posição vinha de `onLayout` (relativa ao PAI) somada
  // a um topo de lista medido UMA vez. A lista muda de lugar depois — a lista de
  // viajantes chega e empurra tudo para baixo —, e no web o `onLayout` nem
  // dispara para mudança de posição (ResizeObserver só vê tamanho).
  //
  // E O QUE ESTE TESTE NÃO PROVA: por um tempo ele afirmava que o conserto
  // estava feito porque a string `node.measureLayout(target` aparecia no
  // arquivo. Aparecia, e o aplicativo continuava levando ao dia errado — a
  // medida era contra o quadro VISÍVEL do ScrollView, não contra o conteúdo.
  // Procurar uma chamada não diz nada sobre o que ela devolve. Quem prova o
  // comportamento é tests/plan-day-focus.test.cjs, que simula a tela e pergunta
  // qual dia ficou em foco depois do toque; aqui ficam apenas as amarras.
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  // Mede no instante do uso, contra a view de CONTEÚDO do ScrollView — que é a
  // régua de `scrollTo` e, no React Native 0.83, o único argumento que a medida
  // nativa aceita. Ver tests/plan-day-measure.test.cjs.
  assert.match(screen, /measureContentOffset/);
  assert.match(screen, /getInnerViewRef/);
  // E remede quando o conteúdo cresce, que é quando as posições antigas morrem.
  assert.match(screen, /onContentSizeChange=\{refreshDayOffsets\}/);
});

test('o toque na seta muda o dia ANTES de qualquer medida', () => {
  // O BUG QUE ISTO PEGA: `scrollToDay` saía cedo quando a posição não estava
  // medida — e saía antes de marcar o dia. O toque na seta não rolava nada e
  // também não mexia na faixa: nada acontecia.
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  const corpo = screen.slice(screen.indexOf('const scrollToDay'));
  const marcaDia = corpo.indexOf("dispatchFocus({ type: 'choose'");
  const primeiroReturn = corpo.indexOf('return;');

  assert.ok(marcaDia > 0, 'scrollToDay precisa marcar o dia');
  assert.ok(
    marcaDia < primeiroReturn,
    'o dia precisa ser marcado antes de qualquer saída antecipada'
  );
});

test('o cartão de resumo é só da aba Roteiro', () => {
  // Ele fala de dias, custo total e ritmo: em Checklist ou Dicas era um
  // cabeçalho fixo repetindo o que a aba não está mostrando.
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/assistant/AssistantResultScreen.js'),
    'utf8'
  );

  assert.match(screen, /activeTab === 'itinerary' \? \(\s*\n?\s*<View style=\{styles\.summaryCard\}>/);
});

// ── Erro do assistente: a mensagem precisa carregar o código ─────────────────

const assistantErrors = loadEsm('src/utils/assistantErrors.js');
const { formatAssistantError } = assistantErrors;

test('a falha do assistente chega à tela com código e requestId', () => {
  // O BUG QUE ISTO ATACA: "O planejador está temporariamente indisponível" era
  // tudo o que a tela de ajuste mostrava. A Edge Function registra o motivo real
  // (providerStatus, providerReason) indexado pelo requestId — sem o código na
  // tela, achar aquela requisição no log é procurar agulha em palheiro.
  const texto = formatAssistantError({
    error: 'O planejador está temporariamente indisponível. Tente novamente em instantes.',
    code: 'AI_PROVIDER_ERROR',
    requestId: 'journi-2026-09-16-abc123',
  });

  assert.match(texto, /temporariamente indisponível/);
  assert.match(texto, /Código: AI_PROVIDER_ERROR-abc123/);
});

test('sem código nem requestId, ainda sai um identificador', () => {
  // Uma falha sem código é indistinguível de "não houve requisição" — e é
  // exatamente aí que alguém precisa saber que houve.
  const texto = formatAssistantError({});

  assert.match(texto, /Não foi possível falar com o planejador/);
  assert.match(texto, /Código: PLANNER_UNEXPECTED_ERROR-[a-z0-9]{1,6}/);
});

test('o código é higienizado antes de virar texto de tela', () => {
  const texto = formatAssistantError({
    error: 'falhou',
    code: 'ai provider <script>',
    requestId: 'req/../../etc',
  });

  assert.match(texto, /Código: AIPROVIDERSCRIPT-/);
  assert.doesNotMatch(texto, /<script>/);
  assert.doesNotMatch(texto, /\.\./);
});
