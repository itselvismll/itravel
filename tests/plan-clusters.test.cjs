// Agrupamento das paradas que se encostam na tela, e a regra de quais bandeiras
// de país continuam no globo enquanto há roteiro aplicado.
//
// Os dois módulos são PUROS — recebem dados e uma função de projeção, devolvem
// dados. É o que permite exercitar aqui, sem browser, sem WebGL e sem MapLibre,
// exatamente a mesma lógica que roda no globo web e dentro do DOM Component do
// iOS/Android. Se este agrupamento algum dia precisar de um mapa de verdade para
// ser testado, ele voltou a ser código de plataforma.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');
const { countryUtilsDeps } = require('./helpers/countryUtilsDeps.cjs');

const countryUtils = loadEsm('src/utils/countryUtils.js', countryUtilsDeps());
const geoCountryUtils = loadEsm('src/utils/geo-country-utils.js', {
  './countryUtils': countryUtils,
});
const countryFill = loadEsm('src/components/map/countryFill.js', {
  '../../utils/constants': { COLORS: { primary: '#6C2BD9', white: '#FFFFFF' } },
  '../../utils/geo-country-utils': geoCountryUtils,
});
const planRoute = loadEsm('src/components/map/planRoute.js', {
  './countryFill': countryFill,
});
const geoMeasure = loadEsm('src/utils/geoMeasure.js');
const planClusters = loadEsm('src/components/map/planClusters.js', {
  './planRoute': planRoute,
});
const planBadges = loadEsm('src/components/map/planBadges.js', {
  '../../utils/geoMeasure': geoMeasure,
  '../../utils/geo-country-utils': geoCountryUtils,
});

const { CLUSTER_RADIUS_PX, MIXED_CLUSTER_COLOR, clusterMembers, clusterPlanFeatures } =
  planClusters;
const { badgeCountries, countryCodeAt, planPointCountries } = planBadges;
const { buildPlanRouteData, dayColor } = planRoute;

/** Parada no formato que getPlanPoints devolve. */
const point = (day, order, longitude, latitude) => ({
  day,
  order,
  title: `Parada ${day}-${order}`,
  category: 'atracao',
  longitude,
  latitude,
});

/**
 * Projeção falsa: 1 grau = 100 pixels, sem nenhuma esfera no meio.
 *
 * É tudo que o módulo precisa saber sobre "tela" — e é exatamente por isso que a
 * regra pôde sair de dentro do renderer.
 */
const project = ([longitude, latitude]) => ({ x: longitude * 100, y: latitude * 100 });

const featuresOf = (points) => buildPlanRouteData(points).points;

test('duas paradas encostadas viram um badge com a contagem', () => {
  // 0,1 grau = 10 pixels nesta projeção: bem dentro do raio de 44.
  const data = featuresOf([point(1, 1, 0, 0), point(1, 2, 0.1, 0)]);

  const { features } = clusterPlanFeatures(data, project);

  assert.equal(features.length, 1);
  assert.equal(features[0].properties.cluster, true);
  assert.equal(features[0].properties.count, 2);
  assert.equal(features[0].properties.countLabel, '+2');
});

test('paradas distantes na tela continuam cada uma com seu pino', () => {
  // 1 grau = 100 pixels, mais que o dobro do raio.
  const data = featuresOf([point(1, 1, 0, 0), point(1, 2, 1, 0)]);

  const { features } = clusterPlanFeatures(data, project);

  assert.equal(features.length, 2);
  for (const feature of features) assert.notEqual(feature.properties.cluster, true);
});

test('o grupo de um dia só herda a cor daquele dia; misturado, fica neutro', () => {
  const mesmoDia = clusterPlanFeatures(
    featuresOf([point(2, 1, 0, 0), point(2, 2, 0.05, 0)]),
    project
  );
  assert.equal(mesmoDia.features[0].properties.color, dayColor(2));
  assert.equal(mesmoDia.features[0].properties.mixed, false);
  assert.equal(mesmoDia.features[0].properties.day, 2);

  const diasDiferentes = clusterPlanFeatures(
    featuresOf([point(1, 1, 0, 0), point(3, 1, 0.05, 0)]),
    project
  );
  // Pintar com a cor de um dos dias mentiria sobre o que o badge junta.
  assert.equal(diasDiferentes.features[0].properties.color, MIXED_CLUSTER_COLOR);
  assert.equal(diasDiferentes.features[0].properties.mixed, true);
  assert.equal(diasDiferentes.features[0].properties.day, null);
});

test('o badge nasce sobre uma parada de verdade, nunca na média das coordenadas', () => {
  // Duas paradas nos extremos de uma baía: a média cairia na água.
  const data = featuresOf([point(1, 1, 0, 0), point(1, 2, 0.2, 0.2)]);

  const { features } = clusterPlanFeatures(data, project);
  const [longitude, latitude] = features[0].geometry.coordinates;

  const reais = [[0, 0], [0.2, 0.2]];
  assert.ok(
    reais.some(([lng, lat]) => lng === longitude && lat === latitude),
    'o badge deveria estar em cima de uma das paradas'
  );
});

test('as paradas do grupo viajam nas properties e voltam parseáveis', () => {
  const data = featuresOf([point(1, 1, 0, 0), point(1, 2, 0.05, 0), point(1, 3, 0.06, 0)]);

  const { features } = clusterPlanFeatures(data, project);
  const members = clusterMembers(features[0].properties);

  assert.equal(members.length, 3);
  assert.deepEqual(members.map((member) => member.title), [
    'Parada 1-1',
    'Parada 1-2',
    'Parada 1-3',
  ]);
  // A coordenada precisa sobreviver: é com ela que o toque no grupo decide entre
  // aproximar e listar.
  assert.equal(typeof members[0].latitude, 'number');
  assert.equal(typeof members[0].longitude, 'number');
});

test('membros ilegíveis não derrubam a tela', () => {
  assert.deepEqual(clusterMembers(null), []);
  assert.deepEqual(clusterMembers({ members: 'isto não é json' }), []);
  assert.deepEqual(clusterMembers({ members: '{"nao":"array"}' }), []);
  // Um mapa que devolva as properties já desserializadas também serve.
  assert.deepEqual(clusterMembers({ members: [{ title: 'a' }] }), [{ title: 'a' }]);
});

test('sem projeção, nada é agrupado — o desenho volta a ser o de antes', () => {
  const data = featuresOf([point(1, 1, 0, 0), point(1, 2, 0.05, 0)]);

  const { features } = clusterPlanFeatures(data, null);

  assert.equal(features.length, 2);
});

test('parada atrás do globo não agrupa com quem está na frente', () => {
  // A projeção devolve null para a parada oculta, como o renderer faz quando o
  // ponto está no hemisfério de trás. Sem isso, Tóquio e Lisboa agrupariam por
  // cair no mesmo pixel da silhueta.
  const data = featuresOf([point(1, 1, 0, 0), point(1, 2, 0.05, 0)]);
  const partial = ([longitude, latitude]) =>
    (longitude === 0 ? { x: 0, y: 0 } : null);

  const { features } = clusterPlanFeatures(data, partial);

  assert.equal(features.length, 2);
  for (const feature of features) assert.notEqual(feature.properties.cluster, true);
});

test('o raio de agrupamento é maior que o pino e menor que a distância legível', () => {
  // O disco tem raio 13px e o halo 16,5px no zoom de cidade: dois centros a menos
  // de ~34px já se tocam. O raio precisa estar acima disso (agrupa quando
  // encosta) e longe de virar um agrupador de tudo.
  assert.ok(CLUSTER_RADIUS_PX >= 34, 'o raio agruparia tarde demais');
  assert.ok(CLUSTER_RADIUS_PX <= 60, 'o raio agruparia paradas ainda distinguíveis');
});

// ── Bandeiras enquanto há roteiro ────────────────────────────────────────────

/** País quadrado, com a chave de código que o GeoJSON do mundo realmente usa. */
const square = (alpha3, west, south, size = 1) => ({
  type: 'Feature',
  properties: { 'ISO3166-1-Alpha-3': alpha3, ADMIN: alpha3 },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [west, south],
      [west + size, south],
      [west + size, south + size],
      [west, south + size],
      [west, south],
    ]],
  },
});

const WORLD = { type: 'FeatureCollection', features: [square('PRT', -10, 38), square('ESP', -5, 38)] };

test('a parada é resolvida para o país que a contém', () => {
  assert.equal(countryCodeAt({ longitude: -9.5, latitude: 38.5 }, WORLD), 'PRT');
  assert.equal(countryCodeAt({ longitude: -4.5, latitude: 38.5 }, WORLD), 'ESP');
  // No mar entre os dois não há país, e isso é uma resposta legítima.
  assert.equal(countryCodeAt({ longitude: -20, latitude: 38.5 }, WORLD), null);
  assert.equal(countryCodeAt({ longitude: null, latitude: 38.5 }, WORLD), null);
});

test('o país de cada parada sai na mesma ordem dos pontos', () => {
  const codes = planPointCountries(
    [point(1, 1, -9.5, 38.5), point(1, 2, -4.5, 38.5), point(2, 1, -20, 38.5)],
    WORLD
  );

  assert.deepEqual(codes, ['PRT', 'ESP', null]);
});

test('sem geometria carregada, nenhuma parada tem bandeira — e nada quebra', () => {
  assert.deepEqual(planPointCountries([point(1, 1, -9.5, 38.5)], null), [null]);
});

test('com roteiro aplicado, só os países do roteiro mantêm badge', () => {
  const countries = [{ code: 'PRT' }, { code: 'ESP' }, { code: 'FRA' }];

  assert.deepEqual(
    badgeCountries(countries, ['PRT', null], true).map((country) => country.code),
    ['PRT']
  );
});

test('sem roteiro, o globo continua com todas as bandeiras', () => {
  const countries = [{ code: 'PRT' }, { code: 'ESP' }];

  assert.equal(badgeCountries(countries, [], false), countries);
  // Roteiro cujo país nenhum foi resolvido (geometria ainda carregando) também
  // devolve tudo: esconder todos os badges deixaria o globo sem referência.
  assert.equal(badgeCountries(countries, [null, null], true), countries);
});

// ── Faixa de dias (calendário) ───────────────────────────────────────────────

const planDayStrip = loadEsm('src/components/map/planDayStrip.js');
const {
  DAY_WINDOW_SIZE,
  buildDayInfo,
  dayPillLabel,
  daySummaryLabel,
  dayWindow,
  needsDayStrip,
  stepDay,
} = planDayStrip;

const daysUpTo = (total) => Array.from({ length: total }, (_, index) => index + 1);

test('a faixa mostra cinco dias e só ganha setas quando há dia fora dela', () => {
  assert.equal(DAY_WINDOW_SIZE, 5);
  assert.equal(needsDayStrip(daysUpTo(5)), false);
  assert.equal(needsDayStrip(daysUpTo(6)), true);
  assert.equal(needsDayStrip([]), false);
});

test('roteiro curto aparece inteiro, sem janela nenhuma', () => {
  assert.deepEqual(dayWindow(daysUpTo(4), 2), [1, 2, 3, 4]);
  assert.deepEqual(dayWindow(daysUpTo(5), 5), [1, 2, 3, 4, 5]);
});

test('o dia em foco fica no meio da janela', () => {
  // O caso que o Elvis descreveu: dia 10 de 21 mostra 8..12.
  assert.deepEqual(dayWindow(daysUpTo(21), 10), [8, 9, 10, 11, 12]);
});

test('nas pontas a janela para de deslizar, em vez de deixar buraco', () => {
  // Centrar o dia 1 pediria dois lugares antes dele — e eles seriam vazios.
  assert.deepEqual(dayWindow(daysUpTo(21), 1), [1, 2, 3, 4, 5]);
  assert.deepEqual(dayWindow(daysUpTo(21), 2), [1, 2, 3, 4, 5]);
  assert.deepEqual(dayWindow(daysUpTo(21), 20), [17, 18, 19, 20, 21]);
  assert.deepEqual(dayWindow(daysUpTo(21), 21), [17, 18, 19, 20, 21]);

  // E a janela tem SEMPRE cinco dias cheios, em qualquer posição.
  for (const day of daysUpTo(21)) {
    assert.equal(dayWindow(daysUpTo(21), day).length, 5, `dia ${day}`);
  }
});

test('sem dia escolhido, a janela mostra o começo do roteiro', () => {
  assert.deepEqual(dayWindow(daysUpTo(21), null), [1, 2, 3, 4, 5]);
});

test('a seta anda um dia e para nas pontas, sem dar a volta', () => {
  const days = daysUpTo(21);

  assert.equal(stepDay(days, 5, 1), 6);
  assert.equal(stepDay(days, 5, -1), 4);
  // Voltar do dia 1 para o dia 21 com um toque faria perder a referência.
  assert.equal(stepDay(days, 21, 1), null);
  assert.equal(stepDay(days, 1, -1), null);

  // Com "Tudo" em foco, a seta entra pela ponta correspondente.
  assert.equal(stepDay(days, null, 1), 1);
  assert.equal(stepDay(days, null, -1), 21);
  assert.equal(stepDay([], null, 1), null);
});

test('com data no roteiro, a pílula mostra o dia da semana — e o dia da VIAGEM', () => {
  // O BUG QUE ISTO PEGA, e que este mesmo teste já cravou como se fosse certo:
  // a linha de baixo era o dia do MÊS. A pílula do dia 3 da viagem saía escrita
  // "15", e tocar nela levava ao cartão marcado "3". Numa viagem começando em 2
  // de outubro isso vira um deslocamento de -1 constante: a pessoa toca no "4" e
  // chega no "3". Nenhuma conta de scroll conserta isso, porque o erro está na
  // UNIDADE do rótulo, não na posição.
  //
  // 2026-10-15 é uma quinta-feira.
  assert.deepEqual(dayPillLabel(3, '2026-10-15'), { top: 'QUI', bottom: '3' });

  // O dia da semana continua vindo da data, com meio-dia UTC na conversão: às
  // 00:00 o fuso do Brasil mostraria a véspera.
  assert.deepEqual(dayPillLabel(1, '2026-01-01'), { top: 'QUI', bottom: '1' });
  assert.deepEqual(dayPillLabel(12, '2026-10-15'), { top: 'QUI', bottom: '12' });
});

test('só existe UMA conta que numera um dia do roteiro', () => {
  // O BUG QUE ISTO PEGA: a fórmula `Number(day?.day) || index + 1` estava
  // copiada em quatro lugares — a lista da faixa, o crachá do cartão, as paradas
  // e as datas. Quatro cópias de uma regra de numeração é a condição que deixa
  // "tocar no dia N e chegar no N-1" possível; ele voltou quatro vezes.
  const { planDayNumber } = planDayStrip;

  assert.equal(planDayNumber({ day: 7 }, 0), 7, 'o número do roteiro manda');
  assert.equal(planDayNumber({ day: '7' }, 0), 7, 'texto vira número');
  // Sem `day` utilizável, vale a posição — 1-based, porque a viagem começa no 1.
  assert.equal(planDayNumber({}, 0), 1);
  assert.equal(planDayNumber({ day: 0 }, 3), 4);
  assert.equal(planDayNumber({ day: null }, 3), 4);
  assert.equal(planDayNumber({ day: '' }, 20), 21);
  assert.equal(planDayNumber(null, 0), 1);
  assert.equal(planDayNumber(undefined, 10), 11);

  // Serve direto num `.map`, que é como a tela a usa: o terceiro argumento do
  // map (o array) não pode atrapalhar.
  assert.deepEqual([{ day: 3 }, {}, { day: 9 }].map(planDayNumber), [3, 2, 9]);

  // E a fórmula não está mais copiada solta pelo código.
  const fs = require('fs');
  const path = require('path');
  const arquivos = [
    'src/components/map/planDayStrip.js',
    'src/components/map/PlanDayTabs.js',
    'src/screens/assistant/AssistantResultScreen.js',
  ];
  for (const arquivo of arquivos) {
    const fonte = fs.readFileSync(path.resolve(__dirname, '..', arquivo), 'utf8');
    // O padrão procurado é o da numeração de DIA DO ROTEIRO: cair para a
    // posição na lista, 1-based. O `|| 1` de `buildDayInfo` é outra regra, para
    // paradas, e está comentado como tal no módulo.
    const copias = fonte
      .split(/\r?\n/)
      .filter((linha) => !/^\s*(\/\/|\*|\/\*)/.test(linha))
      .filter((linha) => /\|\|\s*\w*[Ii]ndex \+ 1/.test(linha));
    assert.deepEqual(
      copias,
      arquivo.endsWith('planDayStrip.js')
        ? ['  Number(planDay?.day) || index + 1;']
        : [],
      `${arquivo} voltou a ter uma cópia da conta de numeração:\n${copias.join('\n')}`
    );
  }
});

test('o número da pílula é SEMPRE o dia da viagem, com data ou sem', () => {
  // A invariante que fecha a família de bugs: o que a pílula escreve e o que ela
  // entrega no toque são o mesmo número, em qualquer roteiro.
  for (const dia of [1, 2, 3, 9, 10, 20, 21]) {
    assert.equal(dayPillLabel(dia, '2026-10-02').bottom, String(dia));
    assert.equal(dayPillLabel(dia, null).bottom, String(dia));
  }
});

test('sem data, a pílula mostra a posição no roteiro', () => {
  assert.deepEqual(dayPillLabel(3, null), { top: 'DIA', bottom: '3' });
  assert.deepEqual(dayPillLabel(3, ''), { top: 'DIA', bottom: '3' });
  // Data malformada é tratada como ausente, não como calendário errado.
  assert.deepEqual(dayPillLabel(7, '15/10/2026'), { top: 'DIA', bottom: '7' });
});

test('a legenda diz onde se está na viagem, e onde a viagem está', () => {
  assert.equal(
    daySummaryLabel({ selectedDay: 3, totalDays: 21, place: 'Zagreb, Croácia' }),
    'Dia 3 de 21 · Zagreb, Croácia'
  );
  // Sem lugar resolvido, a legenda não inventa separador solto.
  assert.equal(daySummaryLabel({ selectedDay: 3, totalDays: 21 }), 'Dia 3 de 21');
  // Sem dia escolhido, ela fala da viagem inteira — que é o que o mapa mostra.
  assert.equal(daySummaryLabel({ selectedDay: null, totalDays: 21 }), 'Todos os 21 dias');
});

test('o lugar do dia é o da primeira parada, com o país como reserva', () => {
  const points = [
    { day: 1, order: 1, location: 'Zagreb, Croácia' },
    { day: 1, order: 2, location: 'Museu' },
    { day: 2, order: 1, location: '' },
  ];
  const plan = { days: [{ day: 1, date: '2026-10-15' }, { day: 2, date: null }] };

  const info = buildDayInfo(points, plan, ['Croácia', 'Croácia', 'Eslovênia']);

  assert.equal(info[1].place, 'Zagreb, Croácia');
  assert.equal(info[1].date, '2026-10-15');
  // Parada sem `location` cai no país resolvido pela geometria.
  assert.equal(info[2].place, 'Eslovênia');
  assert.equal(info[2].date, null);
});

test('buildDayInfo aguenta roteiro sem nada disso', () => {
  assert.deepEqual(buildDayInfo([], null, []), {});
  assert.deepEqual(buildDayInfo(null, null, null), {});
});

test('a pílula do dia não selecionado traz o próprio fundo', () => {
  // O BUG QUE ISTO PEGA: os valores do mockup (branco a 5%, opacidade 0.35)
  // foram desenhados sobre uma tela escura chapada. O fundo real é imagem de
  // satélite, e sobre deserto ou nuvem a pílula sumia — os dias vizinhos ficavam
  // invisíveis, sobrando só o dia selecionado na tela.
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/components/map/PlanDayTabs.js'),
    'utf8'
  );

  // Fundo sólido, o mesmo vidro escuro das setas e dos outros controles do globo.
  assert.match(source, /pillIdle: \{[\s\S]{0,400}backgroundColor: 'rgba\(22,31,56,0\.94\)'/);

  // E a opacidade não desce a ponto de apagar a pílula: quem separa o dia em
  // foco dos vizinhos é o tamanho e a cor, não o sumiço dos outros.
  const dims = [...source.matchAll(/distance === \d \? ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(dims.length >= 2, 'a regra de opacidade sumiu do componente');
  for (const dim of dims) {
    assert.ok(dim >= 0.8, `opacidade ${dim} deixa a pílula ilegível sobre satélite`);
  }
});

test('tocar no dia N rola para o cartão do dia N — nunca para o N-1', () => {
  const { scrollTargetForDay } = planDayStrip;

  // O BUG QUE ISTO PEGA: tocar na pílula do dia 3 levava ao dia 2.
  const offsets = { 1: 400, 2: 1200, 3: 2000, 4: 2800 };

  assert.equal(scrollTargetForDay(offsets, 3), 2000 - 12);
  // E explicitamente NÃO o cartão anterior.
  assert.notEqual(scrollTargetForDay(offsets, 3), 1200 - 12);

  for (const day of [1, 2, 3, 4]) {
    assert.equal(scrollTargetForDay(offsets, day), offsets[day] - 12, `dia ${day}`);
  }
});

test('a posição é achada mesmo com a chave em texto', () => {
  // `{[day]: y}` guarda a chave como string; a busca precisa achar nos dois
  // formatos, senão todo dia volta "não medido" e o toque não faz nada.
  const { scrollTargetForDay } = planDayStrip;

  assert.equal(scrollTargetForDay({ '3': 2000 }, 3), 1988);
  assert.equal(scrollTargetForDay({ 3: 2000 }, '3'), 1988);
});

test('dia não medido devolve null, e o primeiro dia não rola para negativo', () => {
  const { scrollTargetForDay } = planDayStrip;

  assert.equal(scrollTargetForDay({ 1: 0 }, 9), null);
  assert.equal(scrollTargetForDay({}, 1), null);
  assert.equal(scrollTargetForDay(null, 1), null);
  // Margem maior que a posição não pode virar scroll negativo.
  assert.equal(scrollTargetForDay({ 1: 5 }, 1), 0);
});

test('as setas percorrem o roteiro inteiro, dia a dia', () => {
  // O que a seta faz é escolher o PRÓXIMO dia — e é isso que a tela usa para
  // mover o destaque e rolar. Aqui a sequência inteira é percorrida como um
  // usuário faria, do primeiro ao último e de volta.
  const days = [1, 2, 3, 4, 5, 6, 7];

  let atual = null;
  const visitados = [];
  for (let i = 0; i < days.length + 2; i += 1) {
    const proximo = stepDay(days, atual, 1);
    if (proximo === null) break;
    atual = proximo;
    visitados.push(atual);
  }
  assert.deepEqual(visitados, days, 'a seta ▶ precisa alcançar todos os dias');

  const devolta = [];
  for (let i = 0; i < days.length + 2; i += 1) {
    const anterior = stepDay(days, atual, -1);
    if (anterior === null) break;
    atual = anterior;
    devolta.push(atual);
  }
  assert.deepEqual(devolta, [6, 5, 4, 3, 2, 1], 'a seta ◀ precisa voltar até o dia 1');
});
