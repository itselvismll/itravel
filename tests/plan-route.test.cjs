// Plotagem do roteiro no globo — Parte 2 do roteiro visual.
//
// A metade pura de planRoute.js: as cores por dia, os dados que vão para as duas
// sources, o enquadramento e o ciclo de vida das layers. Como o módulo não
// importa `maplibre-gl` (só fala com um objeto que tem addSource/addLayer), tudo
// isso roda com um mapa falso — sem browser, sem WebGL.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const countryUtils = loadEsm('src/utils/countryUtils.js');
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

const {
  BASE_DAY_COLORS,
  CATEGORY_EMOJI,
  PLAN_HALO_LAYER_ID,
  PLAN_LABEL_LAYER_ID,
  PLAN_LABEL_ZOOM,
  PLAN_LAYER_IDS,
  PLAN_LINE_LAYER_ID,
  PLAN_LINE_FALLBACK_LAYER_ID,
  planDays,
  setPlanDayFilter,
  PLAN_LINE_SOURCE_ID,
  PLAN_NUMBER_LAYER_ID,
  PLAN_PIN_LAYER_ID,
  PLAN_POINT_SOURCE_ID,
  attachPlanRouteLayers,
  bindPlanPointClick,
  buildPlanRouteData,
  categoryIconId,
  dayColor,
  detachPlanRouteLayers,
  planBounds,
  resolveTextFont,
  updatePlanRouteData,
} = planRoute;

/**
 * Mapa falso: guarda sources e layers, e registra a ordem de inserção com o
 * `beforeId` que cada layer recebeu — é o que prova o empilhamento.
 */
const fakeMap = (/** @type {{ styleLayers?: any[] }} */ { styleLayers } = {}) => {
  const sources = new Map();
  const layers = new Map();
  const inserted = [];
  const listeners = [];
  // Registro das chamadas que MUDAM o mapa depois de montado. É o que prova, por
  // exemplo, que trocar de dia mexe só no filtro e não reenvia geometria.
  const calls = [];

  return {
    sources,
    layers,
    inserted,
    listeners,
    calls,
    getStyle: () => ({
      layers: styleLayers ?? [
        { id: 'background', type: 'background' },
        { id: 'water', type: 'fill' },
        { id: 'highway_name_other', type: 'symbol', layout: { 'text-font': ['Stadia Regular'] } },
      ],
    }),
    getSource: (id) => sources.get(id),
    addSource: (id, definition) => {
      sources.set(id, {
        ...definition,
        setDataCalls: [],
        setData(data) {
          this.data = data;
          this.setDataCalls.push(data);
        },
      });
    },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (layer, beforeId) => {
      layers.set(layer.id, layer);
      inserted.push({ id: layer.id, beforeId });
    },
    removeLayer: (id) => layers.delete(id),
    setFilter: (id, filter) => {
      calls.push(['setFilter', id, filter]);
      const layer = layers.get(id);
      if (layer) layer.filter = filter;
    },
    getCanvas: () => ({ style: {} }),
    on: (type, layerId, handler) => listeners.push({ type, layerId, handler }),
    off: (type, layerId, handler) => {
      const index = listeners.findIndex(
        (entry) => entry.type === type && entry.layerId === layerId && entry.handler === handler
      );
      if (index >= 0) listeners.splice(index, 1);
    },
  };
};

const point = (day, order, overrides = {}) => ({
  day,
  order,
  title: `Lugar ${day}-${order}`,
  description: 'Descrição',
  category: 'atracao',
  latitude: 38.7 + day * 0.01 + order * 0.001,
  longitude: -9.1 + day * 0.01 + order * 0.001,
  ...overrides,
});

// ── Cores por dia ────────────────────────────────────────────────────────────

test('os quatro primeiros dias usam a paleta fixa da marca', () => {
  assert.deepEqual([1, 2, 3, 4].map(dayColor), BASE_DAY_COLORS);
  assert.deepEqual(BASE_DAY_COLORS, ['#FF4D6D', '#00D1C1', '#FF9A00', '#6C2BD9']);
});

test('roteiro longo recebe uma cor distinta por dia, sem repetir a paleta fixa', () => {
  const days = Array.from({ length: 24 }, (_, index) => index + 1);
  const colors = days.map(dayColor);

  assert.equal(new Set(colors).size, colors.length, 'dois dias ficaram com a mesma cor');
  for (const color of colors) assert.match(color, /^#[0-9A-F]{6}$/);

  // Do dia 5 em diante nenhuma cor gerada pode se passar por uma das fixas.
  for (const color of colors.slice(4)) {
    assert.ok(!BASE_DAY_COLORS.includes(color), `${color} repete uma cor da paleta fixa`);
  }
});

// ── Dados das sources ────────────────────────────────────────────────────────

test('cada ponto vira uma feature com número, cor do dia e ícone da categoria', () => {
  const { points } = buildPlanRouteData([
    point(1, 1, { category: 'restaurante' }),
    point(2, 1, { category: 'nao_existe' }),
  ]);

  assert.equal(points.type, 'FeatureCollection');
  assert.equal(points.features.length, 2);

  const [first, second] = points.features;
  assert.equal(first.geometry.type, 'Point');
  assert.equal(first.properties.color, BASE_DAY_COLORS[0]);
  // String, e não número: `text-field` não formata número.
  assert.equal(first.properties.orderLabel, '1');
  assert.equal(first.properties.icon, categoryIconId('restaurante'));
  assert.equal(first.properties.description, 'Descrição');

  assert.equal(second.properties.color, BASE_DAY_COLORS[1]);
  // Categoria fora do enum cai em "outro" em vez de pedir um ícone inexistente.
  assert.equal(second.properties.icon, categoryIconId('outro'));
});

test('há uma linha por dia e nenhuma liga dias diferentes', () => {
  const points = [
    point(1, 1), point(1, 2), point(1, 3),
    point(2, 1), point(2, 2),
    point(3, 1),
  ];
  const { lines } = buildPlanRouteData(points);

  // O dia 3 tem um ponto só: sem segmento, sem linha.
  assert.deepEqual(lines.features.map((feature) => feature.properties.day), [1, 2]);

  for (const feature of lines.features) {
    const { day, color } = feature.properties;
    assert.equal(color, dayColor(day));

    const expected = points
      .filter((item) => item.day === day)
      .map((item) => [item.longitude, item.latitude]);
    assert.deepEqual(feature.geometry.coordinates, expected);
  }
});

test('a ordem de visita do dia é a ordem dos vértices da linha', () => {
  const { lines } = buildPlanRouteData([point(1, 1), point(1, 2), point(1, 3)]);
  const [first, second, third] = lines.features[0].geometry.coordinates;
  assert.ok(first[0] < second[0] && second[0] < third[0]);
});

test('todas as categorias do enum têm ícone', () => {
  for (const category of Object.keys(CATEGORY_EMOJI)) {
    assert.equal(categoryIconId(category), `journi-cat-${category}`);
  }
});

// ── Enquadramento ────────────────────────────────────────────────────────────

test('planBounds envolve todos os pontos, mesmo cruzando países', () => {
  const bounds = planBounds([
    point(1, 1, { latitude: 38.7, longitude: -9.1 }),
    point(2, 1, { latitude: 48.85, longitude: 2.35 }),
    point(3, 1, { latitude: 41.9, longitude: 12.5 }),
  ]);

  assert.deepEqual(bounds, [[-9.1, 38.7], [12.5, 48.85]]);
});

test('planBounds devolve null sem pontos', () => {
  assert.equal(planBounds([]), null);
  assert.equal(planBounds(undefined), null);
});

// ── Ciclo de vida das layers ─────────────────────────────────────────────────

test('attach cria as duas sources e as cinco layers abaixo dos rótulos', () => {
  const map = fakeMap();
  const data = buildPlanRouteData([point(1, 1), point(1, 2)]);

  assert.equal(attachPlanRouteLayers(map, { data }), true);

  assert.ok(map.getSource(PLAN_POINT_SOURCE_ID));
  assert.ok(map.getSource(PLAN_LINE_SOURCE_ID));
  for (const layerId of PLAN_LAYER_IDS) assert.ok(map.getLayer(layerId), `faltou ${layerId}`);

  // Todas ancoradas no primeiro symbol layer da style: acima do satélite e do
  // território pintado, abaixo dos nomes de cidade.
  for (const entry of map.inserted) assert.equal(entry.beforeId, 'highway_name_other');

  // Ordem de empilhamento: linha, halo, disco, número, rótulo.
  assert.deepEqual(map.inserted.map((entry) => entry.id), PLAN_LAYER_IDS);
});

test('attach é idempotente: chamar de novo atualiza dados sem duplicar layer', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1), point(1, 2)]) });

  const outro = buildPlanRouteData([point(2, 1), point(2, 2)]);
  attachPlanRouteLayers(map, { data: outro });

  assert.equal(map.inserted.length, PLAN_LAYER_IDS.length);
  assert.deepEqual(map.getSource(PLAN_POINT_SOURCE_ID).setDataCalls.at(-1), outro.points);
});

test('attach não faz nada com a style ainda crua', () => {
  const map = fakeMap({ styleLayers: [] });
  assert.equal(attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1)]) }), false);
  assert.equal(map.layers.size, 0);
  assert.equal(map.sources.size, 0);
});

test('trocar de roteiro só troca os dados das sources', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1), point(1, 2)]) });

  const proximo = buildPlanRouteData([point(1, 1), point(2, 1), point(2, 2)]);
  assert.equal(updatePlanRouteData(map, proximo), true);

  assert.equal(map.inserted.length, PLAN_LAYER_IDS.length);
  assert.deepEqual(map.getSource(PLAN_POINT_SOURCE_ID).data, proximo.points);
  assert.deepEqual(map.getSource(PLAN_LINE_SOURCE_ID).data, proximo.lines);
});

test('update devolve false quando as sources ainda não existem', () => {
  assert.equal(updatePlanRouteData(fakeMap(), buildPlanRouteData([point(1, 1)])), false);
});

test('detach devolve o mapa ao estado sem roteiro', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1), point(1, 2)]) });

  detachPlanRouteLayers(map);

  assert.equal(map.layers.size, 0);
  assert.equal(map.sources.size, 0);
  // Chamar de novo com o mapa já limpo não pode explodir (a desmontagem pode vir
  // do próprio map.remove()).
  detachPlanRouteLayers(map);
});

test('o rótulo com o nome do lugar só aparece no nível de cidade', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1), point(1, 2)]) });

  assert.equal(map.getLayer(PLAN_LABEL_LAYER_ID).minzoom, PLAN_LABEL_ZOOM);
  // O número acompanha o pino em qualquer zoom, sem sumir por colisão.
  const numero = map.getLayer(PLAN_NUMBER_LAYER_ID).layout;
  assert.equal(numero.minzoom, undefined);
  assert.equal(numero['text-allow-overlap'], true);
  // O emoji entra por icon-image, nunca no text-field (os glyphs da Stadia não
  // têm emoji).
  const rotulo = map.getLayer(PLAN_LABEL_LAYER_ID).layout;
  assert.deepEqual(rotulo['icon-image'], ['get', 'icon']);
  assert.deepEqual(rotulo['text-field'], ['get', 'title']);
  // A linha reta entre os pontos é tracejada; a rota real do Directions é
  // contínua. São layers diferentes porque `line-dasharray` não aceita
  // expression data-driven — e porque as duas não significam a mesma coisa.
  assert.equal(map.getLayer(PLAN_LINE_LAYER_ID).paint['line-dasharray'], undefined);
  assert.deepEqual(
    map.getLayer(PLAN_LINE_FALLBACK_LAYER_ID).paint['line-dasharray'],
    [2, 1.6]
  );
  // Cada uma pinta só as features do seu caso, sem sobrepor a outra.
  assert.deepEqual(map.getLayer(PLAN_LINE_LAYER_ID).filter, ['==', ['get', 'routed'], true]);
  assert.deepEqual(
    map.getLayer(PLAN_LINE_FALLBACK_LAYER_ID).filter,
    ['!=', ['get', 'routed'], true]
  );
});

test('a fonte do texto é herdada da style, não fixada num nome de provedor', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1)]) });
  assert.deepEqual(map.getLayer(PLAN_NUMBER_LAYER_ID).layout['text-font'], ['Stadia Regular']);

  // Style sem symbol layer: sem `text-font`, o padrão do MapLibre é o melhor
  // palpite que existe.
  const semSymbol = fakeMap({ styleLayers: [{ id: 'background', type: 'background' }] });
  assert.equal(resolveTextFont(semSymbol), undefined);
});

// ── Toque no pino ────────────────────────────────────────────────────────────

test('o toque no pino devolve as propriedades e a coordenada do ponto', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1), point(1, 2)]) });

  const recebidos = [];
  const unbind = bindPlanPointClick(map, (properties, coordinates) =>
    recebidos.push({ properties, coordinates })
  );

  // O halo é maior que o disco: quem toca na borda precisa abrir o popup também.
  for (const layerId of [PLAN_PIN_LAYER_ID, PLAN_HALO_LAYER_ID]) {
    const listener = map.listeners.find(
      (entry) => entry.type === 'click' && entry.layerId === layerId
    );
    assert.ok(listener, `sem listener de clique em ${layerId}`);
    listener.handler({
      features: [{ properties: { title: 'Torre de Belém' }, geometry: { coordinates: [-9.2, 38.6] } }],
    });
  }

  assert.equal(recebidos.length, 2);
  assert.equal(recebidos[0].properties.title, 'Torre de Belém');
  assert.deepEqual(recebidos[0].coordinates, [-9.2, 38.6]);

  unbind();
  assert.equal(
    map.listeners.filter((entry) => entry.type === 'click').length,
    0,
    'os listeners de clique ficaram pendurados no mapa'
  );
});

test('clique sem feature não abre popup', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1)]) });

  let chamou = false;
  bindPlanPointClick(map, () => { chamou = true; });
  map.listeners
    .find((entry) => entry.type === 'click' && entry.layerId === PLAN_PIN_LAYER_ID)
    .handler({ features: [] });

  assert.equal(chamou, false);
});

// ── Rota do Mapbox no desenho ────────────────────────────────────────────────

test('sem rota do Mapbox o desenho é o da IA, com linha reta', () => {
  const data = buildPlanRouteData([point(1, 1), point(1, 2), point(1, 3)]);

  const linha = data.lines.features[0];
  // A reta liga os pontos direto: é o palpite, e a layer tracejada é quem o
  // desenha.
  assert.equal(linha.properties.routed, false);
  assert.equal(linha.geometry.coordinates.length, 3);
  assert.deepEqual(
    data.points.features.map((f) => f.properties.orderLabel),
    ['1', '2', '3']
  );
});

test('com rota do Mapbox a linha vira o traçado real e os pinos renumeram', () => {
  // A Optimization devolveu a visita na ordem 1 → 3 → 2, e o Directions devolveu
  // o caminho de rua entre elas.
  const points = [point(1, 1), point(1, 2), point(1, 3)];
  const otimizado = [points[0], points[2], points[1]];
  const traçado = [[-1, 1], [-2, 2], [-3, 3], [-4, 4]];
  const routes = new Map([[1, { points: otimizado, coordinates: traçado, optimized: true, routed: true }]]);

  const data = buildPlanRouteData(points, routes);

  const linha = data.lines.features[0];
  assert.equal(linha.properties.routed, true);
  assert.deepEqual(linha.geometry.coordinates, traçado);

  // O número do pino segue a SEQUÊNCIA desenhada, não o `order` da IA: um pino
  // "3" entre o 1 e o 2 faria a linha parecer errada.
  const props = data.points.features.map((f) => f.properties);
  assert.deepEqual(props.map((p) => p.orderLabel), ['1', '2', '3']);
  assert.deepEqual(props.map((p) => p.sequence), [1, 2, 3]);
  // E o `order` original continua disponível para quem precisar dele.
  assert.deepEqual(props.map((p) => p.order), [1, 3, 2]);
});

test('rota que cobre menos pontos que o dia é descartada', () => {
  // Resposta truncada sumiria com paradas do roteiro. Melhor a ordem da IA
  // inteira do que uma ordem "melhor" com um lugar a menos.
  const points = [point(1, 1), point(1, 2), point(1, 3)];
  const routes = new Map([[1, { points: [points[0], points[1]], coordinates: null }]]);

  const data = buildPlanRouteData(points, routes);

  assert.equal(data.points.features.length, 3);
  assert.deepEqual(
    data.points.features.map((f) => f.properties.order),
    [1, 2, 3]
  );
});

test('um dia com rota e outro sem convivem no mesmo roteiro', () => {
  // É o estado normal enquanto as respostas chegam uma a uma, e o estado final
  // quando o Mapbox falha só em alguns dias.
  const points = [point(1, 1), point(1, 2), point(2, 1), point(2, 2)];
  const routes = new Map([[1, { coordinates: [[0, 0], [1, 1]], routed: true }]]);

  const data = buildPlanRouteData(points, routes);
  const porDia = new Map(data.lines.features.map((f) => [f.properties.day, f.properties.routed]));

  assert.equal(porDia.get(1), true);
  assert.equal(porDia.get(2), false);
});

// ── Filtro de dia ────────────────────────────────────────────────────────────

test('o filtro de dia esconde os outros dias sem tocar nos dados', () => {
  const map = fakeMap();
  const data = buildPlanRouteData([point(1, 1), point(1, 2), point(2, 1), point(2, 2)]);
  attachPlanRouteLayers(map, { data });
  map.calls.length = 0;

  assert.equal(setPlanDayFilter(map, 2), true);

  // Nada de setData: a geometria já está no worker e trocar de dia é só mudar o
  // que se pinta dela.
  for (const [kind] of map.calls) assert.equal(kind, 'setFilter');

  // Nas layers de ponto, o filtro é só o dia.
  assert.deepEqual(map.getLayer(PLAN_PIN_LAYER_ID).filter, ['==', ['get', 'day'], 2]);

  // Nas de linha, o dia entra JUNTO com o `routed` — se o dia sobrescrevesse o
  // filtro base, a rota real e a reta apareceriam as duas ao mesmo tempo.
  assert.deepEqual(map.getLayer(PLAN_LINE_LAYER_ID).filter, [
    'all',
    ['==', ['get', 'routed'], true],
    ['==', ['get', 'day'], 2],
  ]);
  assert.deepEqual(map.getLayer(PLAN_LINE_FALLBACK_LAYER_ID).filter, [
    'all',
    ['!=', ['get', 'routed'], true],
    ['==', ['get', 'day'], 2],
  ]);
});

test('voltar para "todos" devolve o filtro base, não nenhum filtro', () => {
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1), point(2, 1)]) });

  setPlanDayFilter(map, 1);
  setPlanDayFilter(map, null);

  // O ponto volta sem filtro nenhum...
  assert.equal(map.getLayer(PLAN_PIN_LAYER_ID).filter, undefined);
  // ...mas a linha PRECISA manter o `routed`, senão as duas layers desenhariam
  // a mesma feature e o tracejado apareceria por baixo da rota real.
  assert.deepEqual(map.getLayer(PLAN_LINE_LAYER_ID).filter, ['==', ['get', 'routed'], true]);
});

test('filtrar antes das layers existirem não quebra', () => {
  assert.equal(setPlanDayFilter(fakeMap(), 1), false);
  assert.equal(setPlanDayFilter(null, 1), false);
});

test('os dias do roteiro saem ordenados e sem repetição', () => {
  assert.deepEqual(planDays([point(2, 1), point(1, 1), point(1, 2), point(10, 1)]), [1, 2, 10]);
  assert.deepEqual(planDays([]), []);
  assert.deepEqual(planDays(undefined), []);
});

test('toda layer do roteiro responde ao filtro de dia', () => {
  // Uma layer esquecida aqui deixaria, por exemplo, o rótulo do dia 3 na tela
  // com o mapa mostrando o dia 1.
  const map = fakeMap();
  attachPlanRouteLayers(map, { data: buildPlanRouteData([point(1, 1), point(2, 1)]) });
  setPlanDayFilter(map, 1);

  for (const layerId of PLAN_LAYER_IDS) {
    const filter = JSON.stringify(map.getLayer(layerId).filter);
    assert.match(filter, /"day"/, `${layerId} não filtra por dia`);
  }
});
