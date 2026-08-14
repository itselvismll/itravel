// Pintura do território (fill layer do MapLibre) — Fase 2 da migração.
//
// A diferenciação de visitado/wishlist saiu do badge e foi para o mapa. Estes
// testes exercitam as duas metades puras disso: os dados que vão para o source
// (cruzando os códigos ISO espalhados pelo GeoJSON) e as expressions que
// decidem a cor de cada feature.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const countryUtils = loadEsm('src/utils/countryUtils.js');
const geoCountryUtils = loadEsm('src/utils/geo-country-utils.js', {
  './countryUtils': countryUtils,
});
const fill = loadEsm('src/components/map/countryFill.js', {
  '../../utils/constants': { COLORS: { primary: '#6C2BD9', white: '#FFFFFF' } },
  '../../utils/geo-country-utils': geoCountryUtils,
});

const {
  COUNTRY_FILL_LAYER_ID,
  COUNTRY_OUTLINE_LAYER_ID,
  COUNTRY_SOURCE_ID,
  VISITED_FILL_COLOR,
  VISITED_FILL_OPACITY,
  WISHLIST_FILL_COLOR,
  WISHLIST_FILL_OPACITY,
  attachCountryLayers,
  bindCountryClick,
  buildCountryFillData,
  detachCountryLayers,
  fillColorExpression,
  fillOpacityExpression,
  findFirstSymbolLayerId,
  isStyleReady,
  repaintCountryLayers,
} = fill;

const polygon = {
  type: 'Polygon',
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
};

const feature = (properties) => ({ type: 'Feature', properties, geometry: polygon });

/**
 * Avaliador mínimo das expressions que usamos: `case` + `in` + `get` + literais.
 * Não é o interpretador do MapLibre, é o suficiente para provar que a árvore que
 * montamos classifica cada país no balde certo.
 */
const evaluate = (expression, properties) => {
  if (!Array.isArray(expression)) return expression;

  const [operator, ...args] = expression;

  if (operator === 'literal') return args[0];
  if (operator === 'get') return properties[args[0]];
  if (operator === 'in') {
    return evaluate(args[1], properties).includes(evaluate(args[0], properties));
  }
  if (operator === 'case') {
    for (let index = 0; index + 1 < args.length; index += 2) {
      if (evaluate(args[index], properties)) return evaluate(args[index + 1], properties);
    }
    return evaluate(args[args.length - 1], properties);
  }

  throw new Error(`operador não suportado no teste: ${operator}`);
};

const colorOf = (code, visited, wishlist) =>
  evaluate(fillColorExpression(visited, wishlist), { alpha3: code });
const opacityOf = (code, visited, wishlist) =>
  evaluate(fillOpacityExpression(visited, wishlist), { alpha3: code });

test('cada feature sai com um alpha3 só, venha o código de onde vier', () => {
  const data = buildCountryFillData({
    features: [
      feature({ 'ISO3166-1-Alpha-3': 'BRA' }),
      // Só alpha-2 no dataset: precisa ser convertido, senão o país nunca cruza
      // com a lista do usuário (que é toda alpha-3).
      feature({ 'ISO3166-1-Alpha-2': 'PT' }),
      // Nações do Reino Unido trazem o código próprio em `code`.
      feature({ code: 'sct' }),
    ],
  });

  assert.deepEqual(
    data.features.map((item) => item.properties.alpha3),
    ['BRA', 'PRT', 'SCT']
  );
  assert.equal(data.type, 'FeatureCollection');
});

test('feature sem código ISO fica de fora da fill layer', () => {
  // Bases militares, territórios em disputa e afins. Sem código não há como
  // cruzar com as marcações — e é o mesmo corte que os badges já fazem, então
  // território e badge concordam sobre o que é país.
  const data = buildCountryFillData({
    features: [feature({ 'ISO3166-1-Alpha-3': '-99', name: 'Base' }), feature({ ADMIN: 'X' })],
  });

  assert.equal(data.features.length, 0);
});

test('o GeoJSON compartilhado não é modificado no caminho', () => {
  // O mesmo objeto vem do cache que a MapScreen e o Explorar usam; escrever
  // `alpha3` nas propriedades originais vazaria para as duas telas.
  const original = feature({ 'ISO3166-1-Alpha-3': 'BRA' });
  const geoData = { features: [original] };

  const data = buildCountryFillData(geoData);

  assert.equal(original.properties.alpha3, undefined);
  assert.deepEqual(Object.keys(original.properties), ['ISO3166-1-Alpha-3']);
  // A geometria, essa sim, é compartilhada: copiar polígono de 240 países só
  // para não repetir referência seria desperdício.
  assert.equal(data.features[0].geometry, original.geometry);
});

test('visitado pinta de roxo, wishlist de branco, o resto de nada', () => {
  const visited = new Set(['BRA', 'PRT']);
  const wishlist = new Set(['JPN']);

  assert.equal(colorOf('BRA', visited, wishlist), VISITED_FILL_COLOR);
  assert.equal(colorOf('BRA', visited, wishlist), '#6C2BD9');
  assert.equal(opacityOf('BRA', visited, wishlist), VISITED_FILL_OPACITY);

  assert.equal(colorOf('JPN', visited, wishlist), WISHLIST_FILL_COLOR);
  assert.equal(colorOf('JPN', visited, wishlist), '#FFFFFF');
  assert.equal(opacityOf('JPN', visited, wishlist), WISHLIST_FILL_OPACITY);

  // Não marcado: território transparente, só o satélite.
  assert.equal(opacityOf('ARG', visited, wishlist), 0);
});

test('a opacidade deixa o satélite aparecer por baixo', () => {
  // Fill opaco viraria adesivo e apagaria a imagem — o país marcado tem de
  // continuar sendo um lugar, não uma mancha.
  for (const opacity of [VISITED_FILL_OPACITY, WISHLIST_FILL_OPACITY]) {
    assert.ok(opacity > 0 && opacity <= 0.7, `opacidade fora da faixa: ${opacity}`);
  }

  // O branco pede MAIS opacidade que o roxo, não menos: cor saturada e escura se
  // destaca de qualquer terreno, branco só contra fundo escuro — e sumia sobre
  // deserto e nuvem. Números diferentes para o mesmo resultado percebido.
  assert.ok(
    WISHLIST_FILL_OPACITY > VISITED_FILL_OPACITY,
    'o branco da wishlist precisa de mais opacidade que o roxo para ser visível'
  );
});

test('visitado vence wishlist quando o país está nas duas listas', () => {
  const both = colorOf('BRA', new Set(['BRA']), new Set(['BRA']));

  assert.equal(both, VISITED_FILL_COLOR);
});

test('usuário sem marcação nenhuma gera uma expression válida', () => {
  // Estado inicial de todo mundo, e o caso em que um `match` com rótulos vazios
  // quebraria a style inteira.
  const expression = fillColorExpression(new Set(), new Set());

  assert.doesNotThrow(() => evaluate(expression, { alpha3: 'BRA' }));
  assert.equal(opacityOf('BRA', new Set(), new Set()), 0);
});

test('marcar um país muda só a expression, e a mudança é estável', () => {
  const before = fillColorExpression(new Set(['BRA']), new Set());
  const after = fillColorExpression(new Set(['BRA', 'ARG']), new Set());

  assert.equal(colorOf('ARG', new Set(['BRA']), new Set()) === VISITED_FILL_COLOR, false);
  assert.equal(colorOf('ARG', new Set(['BRA', 'ARG']), new Set()), VISITED_FILL_COLOR);
  assert.notDeepEqual(before, after);

  // Ordem de Set não é garantida; a lista é ordenada para que a mesma seleção
  // produza sempre a mesma expression.
  assert.deepEqual(
    fillColorExpression(new Set(['ARG', 'BRA']), new Set()),
    fillColorExpression(new Set(['BRA', 'ARG']), new Set())
  );
});

test('a fill layer entra abaixo do primeiro symbol layer', () => {
  // Acima do satélite e abaixo de todo rótulo: nome de cidade continua legível
  // por cima do território pintado.
  const layers = [
    { id: 'background', type: 'background' },
    { id: 'satellite', type: 'raster' },
    { id: 'landcover', type: 'fill' },
    { id: 'highway_name_other', type: 'symbol' },
    { id: 'place_label', type: 'symbol' },
  ];

  assert.equal(findFirstSymbolLayerId(layers), 'highway_name_other');

  // Style sem symbol nenhum: undefined manda o MapLibre inserir no topo.
  assert.equal(findFirstSymbolLayerId([{ id: 'bg', type: 'background' }]), undefined);
  assert.equal(findFirstSymbolLayerId(undefined), undefined);
});

test('os ids das layers não colidem com os da style base', () => {
  for (const id of [COUNTRY_SOURCE_ID, COUNTRY_FILL_LAYER_ID, COUNTRY_OUTLINE_LAYER_ID]) {
    assert.match(id, /^journi-/);
  }
});

// --- Montagem no mapa -------------------------------------------------------
//
// Mapa falso com a superfície que attach/repaint/detach usam. Ele registra a
// ordem das chamadas, o que permite provar coisas que só apareceriam no browser:
// que a layer entra antes do primeiro symbol, que nada é duplicado e — o bug
// desta rodada — que a montagem não depende de isStyleLoaded().

const BASE_STYLE_LAYERS = [
  { id: 'background', type: 'background' },
  { id: 'satellite', type: 'raster' },
  { id: 'landcover', type: 'fill' },
  { id: 'highway_name_other', type: 'symbol' },
  { id: 'place_label', type: 'symbol' },
];

const fakeMap = ({ layers = BASE_STYLE_LAYERS } = {}) => {
  const sources = new Map();
  const added = [];
  const calls = [];
  const listeners = new Map();
  let styleLayers = layers;

  return {
    calls,
    added,
    // Este é o ponto do bug: no MapLibre v6, Style.loaded() só é true quando
    // todos os tiles em vista carregaram. Num globo de satélite ele passa a
    // maior parte do tempo em false, então o falso aqui é FIXO de propósito —
    // se a montagem voltar a depender dele, os testes abaixo quebram.
    isStyleLoaded: () => false,
    getStyle: () => (styleLayers ? { layers: [...styleLayers, ...added] } : undefined),
    getSource: (id) => sources.get(id),
    addSource: (id, source) => {
      calls.push(['addSource', id]);
      sources.set(id, {
        ...source,
        setData: (next) => calls.push(['setData', next.features.length]),
      });
    },
    removeSource: (id) => {
      calls.push(['removeSource', id]);
      sources.delete(id);
    },
    getLayer: (id) => added.find((layer) => layer.id === id),
    addLayer: (layer, beforeId) => {
      calls.push(['addLayer', layer.id, beforeId]);
      added.push(layer);
    },
    removeLayer: (id) => {
      calls.push(['removeLayer', id]);
      added.splice(
        added.findIndex((layer) => layer.id === id),
        1
      );
    },
    setPaintProperty: (id, property, value) => {
      calls.push(['setPaintProperty', id, property]);
      const layer = added.find((item) => item.id === id);
      if (layer) layer.paint[property] = value;
    },
    listeners,
    // O MapLibre aceita on(event, handler) e on(event, layerId, handler); o
    // clique no território usa a segunda forma, que é a que faz o hit-test do
    // polígono antes de chamar de volta.
    on: (event, layerOrHandler, maybeHandler) => {
      const key = maybeHandler ? `${event}:${layerOrHandler}` : event;
      listeners.set(key, maybeHandler ?? layerOrHandler);
    },
    off: (event, layerOrHandler, maybeHandler) => {
      listeners.delete(maybeHandler ? `${event}:${layerOrHandler}` : event);
    },
    getCanvas: () => ({ style: {} }),
    // Simula a style terminando de parsear depois da montagem do componente.
    emitStyleLoad: () => {
      styleLayers = layers;
      listeners.get('style.load')?.();
    },
    clearStyle: () => {
      styleLayers = null;
    },
  };
};

const world = () => buildCountryFillData({ features: [feature({ 'ISO3166-1-Alpha-3': 'BRA' })] });

test('a montagem não depende de isStyleLoaded — o bug desta correção', () => {
  // Sintoma: fill layer "criada" mas território nunca pintado, sem erro nenhum
  // no console. Causa: o efeito checava map.isStyleLoaded() e desistia. Esse
  // método responde Style.loaded(), que exige TODOS os tiles em vista
  // carregados; com satélite em streaming ele é false justamente no instante em
  // que o GeoJSON chega da rede. Como o efeito não tinha por que rodar de novo,
  // source e layer nunca eram criados.
  const map = fakeMap();

  assert.equal(map.isStyleLoaded(), false);
  assert.equal(attachCountryLayers(map, { data: world(), visited: new Set(['BRA']) }), true);

  assert.ok(map.getSource(COUNTRY_SOURCE_ID), 'source não foi adicionado');
  assert.ok(map.getLayer(COUNTRY_FILL_LAYER_ID), 'fill layer não foi adicionada');
  assert.ok(map.getLayer(COUNTRY_OUTLINE_LAYER_ID), 'contorno não foi adicionado');
});

test('style ainda não parseada adia a montagem em vez de perdê-la', () => {
  // O outro lado da moeda: se a style realmente não tem layers, addLayer não
  // funcionaria. Aí o certo é esperar o 'style.load' — e montar quando ele vier.
  const map = fakeMap();
  map.clearStyle();

  assert.equal(isStyleReady(map), false);
  assert.equal(attachCountryLayers(map, { data: world(), visited: new Set() }), false);

  map.on('style.load', () => attachCountryLayers(map, { data: world(), visited: new Set() }));
  map.emitStyleLoad();

  assert.ok(map.getLayer(COUNTRY_FILL_LAYER_ID), 'fill layer não voltou depois do style.load');
});

test('as layers entram abaixo do primeiro symbol, para não cobrir os labels', () => {
  const map = fakeMap();
  attachCountryLayers(map, { data: world(), visited: new Set(['BRA']) });

  const inserts = map.calls.filter(([kind]) => kind === 'addLayer');
  assert.equal(inserts.length, 2);
  for (const [, , beforeId] of inserts) {
    assert.equal(beforeId, 'highway_name_other');
  }
});

test('montar duas vezes atualiza os dados sem duplicar layer', () => {
  // O efeito remonta quando o GeoJSON troca de identidade; duplicar layer daria
  // erro de id repetido no MapLibre.
  const map = fakeMap();
  attachCountryLayers(map, { data: world(), visited: new Set() });
  attachCountryLayers(map, { data: world(), visited: new Set() });

  assert.equal(map.calls.filter(([kind]) => kind === 'addLayer').length, 2);
  assert.equal(map.calls.filter(([kind]) => kind === 'addSource').length, 1);
  assert.equal(map.calls.filter(([kind]) => kind === 'setData').length, 1);
});

test('as cores do usuário chegam na paint na montagem, não só na repintura', () => {
  // Se as marcações já tiverem carregado quando o mapa monta, o território tem
  // de nascer pintado — sem depender de um segundo evento para aparecer.
  const map = fakeMap();
  attachCountryLayers(map, { data: world(), visited: new Set(['BRA']), wishlist: new Set(['JPN']) });

  const paint = map.getLayer(COUNTRY_FILL_LAYER_ID).paint;
  assert.equal(evaluate(paint['fill-color'], { alpha3: 'BRA' }), VISITED_FILL_COLOR);
  assert.equal(evaluate(paint['fill-opacity'], { alpha3: 'JPN' }), WISHLIST_FILL_OPACITY);
  assert.equal(evaluate(paint['fill-opacity'], { alpha3: 'ARG' }), 0);
});

test('marcar um país repinta sem reenviar a geometria', () => {
  const map = fakeMap();
  attachCountryLayers(map, { data: world(), visited: new Set() });
  map.calls.length = 0;

  assert.equal(repaintCountryLayers(map, { visited: new Set(['BRA']), wishlist: new Set() }), true);

  const paint = map.getLayer(COUNTRY_FILL_LAYER_ID).paint;
  assert.equal(evaluate(paint['fill-color'], { alpha3: 'BRA' }), VISITED_FILL_COLOR);
  assert.equal(evaluate(paint['fill-opacity'], { alpha3: 'BRA' }), VISITED_FILL_OPACITY);

  // Nada de setData nem addSource: a geometria já está no worker.
  for (const [kind] of map.calls) assert.equal(kind, 'setPaintProperty');
});

test('repintar antes das layers existirem não quebra', () => {
  // Acontece de verdade: as marcações vêm do Supabase e o GeoJSON do GitHub, e
  // não há ordem garantida entre as duas respostas.
  const map = fakeMap();

  assert.equal(repaintCountryLayers(map, { visited: new Set(['BRA']) }), false);
});

test('desmontar remove layers antes do source', () => {
  // Ordem importa: o MapLibre recusa remover um source que ainda tem layer.
  const map = fakeMap();
  attachCountryLayers(map, { data: world(), visited: new Set() });
  map.calls.length = 0;

  detachCountryLayers(map);

  assert.deepEqual(map.calls, [
    ['removeLayer', COUNTRY_OUTLINE_LAYER_ID],
    ['removeLayer', COUNTRY_FILL_LAYER_ID],
    ['removeSource', COUNTRY_SOURCE_ID],
  ]);
});

test('clique no território devolve o país clicado', () => {
  const map = fakeMap();
  attachCountryLayers(map, { data: world(), visited: new Set() });

  const clicked = [];
  const unbind = bindCountryClick(map, (alpha3) => clicked.push(alpha3));

  const handler = map.listeners.get(`click:${COUNTRY_FILL_LAYER_ID}`);
  assert.ok(handler, 'o clique foi registrado sem a layer como alvo');

  // O MapLibre entrega as features atingidas pelo hit-test do polígono.
  handler({ features: [{ properties: { alpha3: 'BRA' } }] });
  assert.deepEqual(clicked, ['BRA']);

  // Clique sem feature (oceano, ou país sem código) não pode abrir nada.
  handler({ features: [] });
  handler({});
  assert.deepEqual(clicked, ['BRA']);

  unbind();
  assert.equal(map.listeners.has(`click:${COUNTRY_FILL_LAYER_ID}`), false);
});

test('desmontar depois do mapa morrer não estoura', () => {
  // map.remove() leva a style junto; a desmontagem do React chega depois.
  assert.doesNotThrow(() => detachCountryLayers({}));
  assert.doesNotThrow(() => detachCountryLayers(null));
});
