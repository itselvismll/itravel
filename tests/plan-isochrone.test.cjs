// "O que tem por perto": a área alcançável a pé em volta de um ponto do roteiro.
//
// São duas metades, e os dois blocos abaixo seguem essa divisão:
//
//   1. mapboxIsochrone.js — a conversa com a API. O que estes testes protegem é
//      a MESMA regra de mapboxRouting.js: nada lança, toda decepção do Mapbox
//      vira `null`. A área é um extra sobre um mapa que já funciona, e um extra
//      não tem direito de derrubar a tela de quem abriu o roteiro.
//
//   2. isochroneLayer.js — o desenho. Como o módulo não importa `maplibre-gl`
//      (só fala com um objeto que tem addSource/addLayer), tudo roda com um mapa
//      falso, sem browser e sem WebGL.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const MAPBOX_TOKEN = 'pk.test';

const load = (token = MAPBOX_TOKEN) =>
  loadEsm('src/services/mapboxIsochrone.js', {
    '../utils/constants': { API_CONFIG: { MAPBOX_TOKEN: token } },
  });

const isochrone = load();
const {
  fetchIsochrone,
  DEFAULT_ISOCHRONE_MINUTES,
  DEFAULT_ISOCHRONE_PROFILE,
  MAX_ISOCHRONE_MINUTES,
} = isochrone;

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
const isochroneLayer = loadEsm('src/components/map/isochroneLayer.js', {
  './countryFill': countryFill,
  './planRoute': planRoute,
});

const {
  ISOCHRONE_COLOR,
  ISOCHRONE_FILL_LAYER_ID,
  ISOCHRONE_FILL_OPACITY,
  ISOCHRONE_LAYER_IDS,
  ISOCHRONE_OUTLINE_LAYER_ID,
  ISOCHRONE_SOURCE_ID,
  attachIsochroneLayers,
  buildIsochroneData,
  detachIsochroneLayers,
  isochroneBeforeId,
  updateIsochroneData,
} = isochroneLayer;

const { PLAN_LINE_LAYER_ID, PLAN_LINE_FALLBACK_LAYER_ID } = planRoute;

/** Ponto no formato que getPlanPoints devolve. */
const POINT = { latitude: 38.7223, longitude: -9.1393 };

/** Anel fechado qualquer — o conteúdo não importa, só a forma. */
const RING = [[-9.15, 38.71], [-9.12, 38.71], [-9.12, 38.74], [-9.15, 38.74], [-9.15, 38.71]];

/** Resposta de sucesso da Isochrone: FeatureCollection de polígonos. */
const okIsochrone = (/** @type {any} */ geometry = { type: 'Polygon', coordinates: [RING] }) => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      // As properties que a API manda descrevem o contorno em unidades dela; o
      // serviço as substitui, e um teste abaixo prova isso.
      properties: { contour: 15, color: '#bf4040', opacity: 0.33 },
      geometry,
    },
  ],
});

/**
 * Troca o `fetch` global por um dublê e devolve as URLs que ele viu.
 *
 * @param {(url: string, init?: any) => any} handler resposta por URL: objeto = corpo JSON,
 *   número = status HTTP de erro, Error = falha de rede.
 */
const withFetch = (handler) => {
  const calls = [];
  const original = global.fetch;
  global.fetch = /** @type {any} */ (async (/** @type {any} */ url, init) => {
    calls.push(String(url));
    const result = handler(String(url), init);
    if (result instanceof Error) throw result;
    if (typeof result === 'number') return { ok: false, status: result, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => result };
  });
  return { calls, restore: () => { global.fetch = original; } };
};

// ── 1. O serviço ─────────────────────────────────────────────────────────────

test('a isócrona é pedida a pé, com o raio em minutos e polígonos', async () => {
  const fetchDouble = withFetch(() => okIsochrone());
  try {
    const feature = await fetchIsochrone(POINT);

    assert.equal(fetchDouble.calls.length, 1);
    const url = fetchDouble.calls[0];

    // Perfil e ordem das coordenadas. `lng,lat` é o que a API espera, que é o
    // inverso do `latitude, longitude` com que o resto do app trabalha —
    // trocá-los desenharia a área no meio do oceano, sem erro nenhum.
    assert.match(url, /\/isochrone\/v1\/mapbox\/walking\//);
    assert.match(url, /-9\.1393%2C38\.7223/);

    assert.match(url, /contours_minutes=15/);
    // `polygons=true` é o que separa uma área preenchível de um contorno de
    // linhas: sem ele a API devolve LineString e a layer de fill não pinta nada.
    assert.match(url, /polygons=true/);
    assert.match(url, new RegExp(`access_token=${MAPBOX_TOKEN}`));

    assert.equal(feature.type, 'Feature');
    assert.equal(feature.geometry.type, 'Polygon');
    assert.deepEqual(feature.geometry.coordinates, [RING]);
  } finally {
    fetchDouble.restore();
  }
});

test('as properties do contorno são trocadas pelas que a camada usa', async () => {
  const fetchDouble = withFetch(() => okIsochrone());
  try {
    const feature = await fetchIsochrone(POINT);

    // A cor e a opacidade da API são as DELA, não as da nossa paleta. Deixá-las
    // passar convidaria a camada a pintar por `['get', 'color']` — e a área
    // sairia no vermelho do Mapbox em vez do teal da marca.
    assert.deepEqual(feature.properties, {
      minutes: DEFAULT_ISOCHRONE_MINUTES,
      profile: DEFAULT_ISOCHRONE_PROFILE,
    });
    assert.equal(feature.properties.color, undefined);
  } finally {
    fetchDouble.restore();
  }
});

test('um raio personalizado chega à API, dentro do teto dela', async () => {
  const fetchDouble = withFetch(() => okIsochrone());
  try {
    await fetchIsochrone(POINT, { minutes: 30 });
    assert.match(fetchDouble.calls[0], /contours_minutes=30/);
  } finally {
    fetchDouble.restore();
  }
});

test('MultiPolygon é aceito: uma área a pé pode ser desconexa', async () => {
  // Acontece de verdade — uma ilha, ou o outro lado de uma ponte longa que entra
  // no tempo por um trecho só. Recusar isso apagaria uma área legítima.
  const geometry = { type: 'MultiPolygon', coordinates: [[RING], [RING]] };
  const fetchDouble = withFetch(() => okIsochrone(geometry));
  try {
    const feature = await fetchIsochrone(POINT);
    assert.equal(feature.geometry.type, 'MultiPolygon');
  } finally {
    fetchDouble.restore();
  }
});

// Cada caso abaixo é um jeito de o Mapbox (ou a nossa própria configuração)
// decepcionar. A resposta certa é sempre a mesma: `null`, sem exceção, para a
// tela seguir como estava.
const FAILURES = /** @type {Array<[string, (url: string) => any]>} */ ([
  ['HTTP 403 (token restrito a outro domínio)', () => 403],
  ['HTTP 422 (coordenada recusada)', () => 422],
  ['HTTP 429 (cota estourada)', () => 429],
  ['rede caída', () => new Error('network')],
  ['corpo sem features', () => ({ type: 'FeatureCollection', features: [] })],
  ['corpo sem geometria de área', () => okIsochrone({ type: 'LineString', coordinates: RING })],
  ['polígono sem anéis', () => okIsochrone({ type: 'Polygon', coordinates: [] })],
]);

for (const [label, handler] of FAILURES) {
  test(`falha não lança e devolve null: ${label}`, async () => {
    const fetchDouble = withFetch(handler);
    try {
      assert.equal(await fetchIsochrone(POINT), null);
    } finally {
      fetchDouble.restore();
    }
  });
}

test('JSON malformado não lança', async () => {
  const original = global.fetch;
  global.fetch = /** @type {any} */ (async () => ({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError('Unexpected token'); },
  }));
  try {
    assert.equal(await fetchIsochrone(POINT), null);
  } finally {
    global.fetch = original;
  }
});

test('sem token não há ida à rede', async () => {
  const fetchDouble = withFetch(() => okIsochrone());
  try {
    // Um `.env.local` sem o token do Mapbox é o caso de desenvolvimento normal:
    // a feature some, e não custa uma requisição que voltaria 401.
    const semToken = load('');
    assert.equal(await semToken.fetchIsochrone(POINT), null);
    assert.equal(fetchDouble.calls.length, 0);
  } finally {
    fetchDouble.restore();
  }
});

const COORDENADAS_INVALIDAS = [
  ['ponto ausente', undefined],
  ['sem coordenadas', { title: 'Parada sem coordenada' }],
  ['latitude nula', { latitude: null, longitude: -9.1 }],
  ['longitude NaN', { latitude: 38.7, longitude: Number.NaN }],
  ['longitude fora do intervalo', { latitude: 38.7, longitude: 999 }],
  ['latitude fora do intervalo', { latitude: 91, longitude: -9.1 }],
];

for (const [label, point] of COORDENADAS_INVALIDAS) {
  test(`coordenada impossível não vai à rede: ${label}`, async () => {
    // Um ponto do roteiro pode ter chegado da IA sem coordenada. Mandar
    // `undefined,undefined` na URL volta 422 depois de uma ida à rede à toa.
    const fetchDouble = withFetch(() => okIsochrone());
    try {
      assert.equal(await fetchIsochrone(point), null);
      assert.equal(fetchDouble.calls.length, 0);
    } finally {
      fetchDouble.restore();
    }
  });
}

const MINUTOS_INVALIDOS = [0, -5, 61, 1000, Number.NaN, null];

for (const minutes of MINUTOS_INVALIDOS) {
  test(`raio fora da faixa não vai à rede: ${String(minutes)}`, async () => {
    // Recortar silenciosamente para o teto mentiria: quem pediu 90 minutos veria
    // uma área de 60 sem saber que ela não é a que pediu.
    const fetchDouble = withFetch(() => okIsochrone());
    try {
      assert.equal(await fetchIsochrone(POINT, { minutes }), null);
      assert.equal(fetchDouble.calls.length, 0);
    } finally {
      fetchDouble.restore();
    }
  });
}

test('o teto de minutos é o da própria API', async () => {
  const fetchDouble = withFetch(() => okIsochrone());
  try {
    assert.equal(MAX_ISOCHRONE_MINUTES, 60);
    assert.notEqual(await fetchIsochrone(POINT, { minutes: MAX_ISOCHRONE_MINUTES }), null);
    assert.equal(await fetchIsochrone(POINT, { minutes: MAX_ISOCHRONE_MINUTES + 1 }), null);
  } finally {
    fetchDouble.restore();
  }
});

test('o cancelamento do chamador chega ao fetch e volta como null', async () => {
  const controller = new AbortController();
  const original = global.fetch;
  global.fetch = /** @type {any} */ (async (_url, init) => {
    assert.ok(init?.signal, 'o fetch precisa receber um signal');
    // O popup fechou no meio do voo: o AbortError não pode escapar como exceção.
    const error = new Error('Aborted');
    error.name = 'AbortError';
    throw error;
  });
  try {
    assert.equal(await fetchIsochrone(POINT, { signal: controller.signal }), null);
  } finally {
    global.fetch = original;
  }
});

// ── 2. A camada ──────────────────────────────────────────────────────────────

/** Mapa falso: guarda sources e layers, e o `beforeId` que cada layer recebeu. */
const fakeMap = (/** @type {{ styleLayers?: any[], planLayers?: string[] }} */ { styleLayers, planLayers = [] } = {}) => {
  const sources = new Map();
  const layers = new Map();
  const inserted = [];

  const map = {
    sources,
    layers,
    inserted,
    getStyle: () => ({
      layers: styleLayers ?? [
        { id: 'background', type: 'background' },
        { id: 'water', type: 'fill' },
        { id: 'place_label', type: 'symbol' },
      ],
    }),
    getSource: (id) => sources.get(id),
    addSource: (id, definition) => {
      sources.set(id, {
        ...definition,
        setDataCalls: [],
        setData(data) { this.setDataCalls.push(data); this.data = data; },
      });
    },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (definition, beforeId) => {
      layers.set(definition.id, definition);
      inserted.push({ id: definition.id, beforeId });
    },
    removeLayer: (id) => layers.delete(id),
  };

  // Layers do roteiro já montadas, para provar a ancoragem abaixo delas.
  for (const id of planLayers) map.layers.set(id, { id });

  return map;
};

const FEATURE = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [RING] },
  properties: { minutes: 15, profile: 'walking' },
};

test('a área vira uma FeatureCollection, e null vira coleção vazia', () => {
  assert.deepEqual(buildIsochroneData(FEATURE), {
    type: 'FeatureCollection',
    features: [FEATURE],
  });
  // É assim que a área se apaga sem remover a layer.
  assert.deepEqual(buildIsochroneData(null), { type: 'FeatureCollection', features: [] });
});

test('a camada cria uma source e as duas layers da área', () => {
  const map = fakeMap();
  assert.equal(attachIsochroneLayers(map, { feature: FEATURE }), true);

  assert.ok(map.sources.get(ISOCHRONE_SOURCE_ID));
  assert.deepEqual(map.sources.get(ISOCHRONE_SOURCE_ID).data.features, [FEATURE]);
  for (const id of ISOCHRONE_LAYER_IDS) assert.ok(map.layers.get(id), `falta ${id}`);
});

test('o preenchimento sai no teal da marca, translúcido', () => {
  const map = fakeMap();
  attachIsochroneLayers(map, { feature: FEATURE });

  const fill = map.layers.get(ISOCHRONE_FILL_LAYER_ID);
  assert.equal(fill.type, 'fill');
  assert.equal(fill.paint['fill-color'], ISOCHRONE_COLOR);
  assert.equal(ISOCHRONE_COLOR, '#00D1C1');

  // A área é CONTEXTO: ela tem de deixar ver o satélite, os pinos e a linha do
  // roteiro por baixo. Opacidade alta esconderia o que o usuário quer olhar
  // dentro dela.
  assert.equal(fill.paint['fill-opacity'], ISOCHRONE_FILL_OPACITY);
  assert.ok(ISOCHRONE_FILL_OPACITY <= 0.3, 'o preenchimento não pode tapar o mapa');

  // A borda existe porque o preenchimento quase some sobre satélite claro.
  const outline = map.layers.get(ISOCHRONE_OUTLINE_LAYER_ID);
  assert.equal(outline.type, 'line');
  assert.equal(outline.paint['line-color'], ISOCHRONE_COLOR);
});

test('a área fica ABAIXO da linha do roteiro', () => {
  // O traçado do dia é a informação principal da tela; uma mancha por cima dele
  // — mesmo a 0.25 — lavaria a cor que identifica o dia.
  const map = fakeMap({ planLayers: [PLAN_LINE_LAYER_ID, PLAN_LINE_FALLBACK_LAYER_ID] });
  attachIsochroneLayers(map, { feature: FEATURE });

  assert.equal(isochroneBeforeId(map), PLAN_LINE_LAYER_ID);
  for (const entry of map.inserted) assert.equal(entry.beforeId, PLAN_LINE_LAYER_ID);
});

test('sem as layers do roteiro, a área ancora no primeiro symbol da style', () => {
  // Área pedida antes de o roteiro montar. A âncora vira a mesma que o roteiro
  // usa: acima do território pintado, abaixo dos rótulos da Stadia.
  const map = fakeMap();
  attachIsochroneLayers(map, { feature: FEATURE });

  assert.equal(isochroneBeforeId(map), 'place_label');
  for (const entry of map.inserted) assert.equal(entry.beforeId, 'place_label');
});

test('montar de novo não duplica nada', () => {
  const map = fakeMap();
  attachIsochroneLayers(map, { feature: FEATURE });
  const first = map.inserted.length;

  attachIsochroneLayers(map, { feature: FEATURE });

  assert.equal(map.inserted.length, first);
  assert.equal(map.layers.size, ISOCHRONE_LAYER_IDS.length);
});

test('style crua não monta nada', () => {
  // O mapa existe mas a style está em voo. Montar aqui estouraria dentro do
  // MapLibre; a camada devolve false e quem chama espera o 'style.load'.
  const map = fakeMap({ styleLayers: [] });
  assert.equal(attachIsochroneLayers(map, { feature: FEATURE }), false);
  assert.equal(map.layers.size, 0);
  assert.equal(map.sources.size, 0);
});

test('trocar de área mexe só nos dados, sem recriar as layers', () => {
  // Tocar num pino, depois noutro, é o uso normal da feature: recriar duas
  // layers a cada troca piscaria a tela.
  const map = fakeMap();
  attachIsochroneLayers(map, { feature: FEATURE });
  const inserted = map.inserted.length;

  const outra = { ...FEATURE, properties: { minutes: 30, profile: 'walking' } };
  assert.equal(updateIsochroneData(map, outra), true);

  assert.equal(map.inserted.length, inserted);
  assert.deepEqual(map.sources.get(ISOCHRONE_SOURCE_ID).data.features, [outra]);
});

test('limpar a área esvazia a source e mantém as layers', () => {
  const map = fakeMap();
  attachIsochroneLayers(map, { feature: FEATURE });

  assert.equal(updateIsochroneData(map, null), true);

  assert.deepEqual(map.sources.get(ISOCHRONE_SOURCE_ID).data.features, []);
  for (const id of ISOCHRONE_LAYER_IDS) assert.ok(map.layers.get(id), `${id} não deve sumir`);
});

test('atualizar antes da source existir devolve false', () => {
  assert.equal(updateIsochroneData(fakeMap(), FEATURE), false);
  assert.equal(updateIsochroneData(null, FEATURE), false);
});

test('desmontar remove tudo que a camada criou, e nada além', () => {
  const map = fakeMap({ planLayers: [PLAN_LINE_LAYER_ID] });
  attachIsochroneLayers(map, { feature: FEATURE });

  detachIsochroneLayers(map);

  for (const id of ISOCHRONE_LAYER_IDS) assert.equal(map.layers.get(id), undefined);
  assert.equal(map.sources.get(ISOCHRONE_SOURCE_ID), undefined);
  // O roteiro continua de pé: esconder a área não mexe no que estava desenhado.
  assert.ok(map.layers.get(PLAN_LINE_LAYER_ID));
});

test('desmontar duas vezes, ou sobre um mapa já destruído, não estoura', () => {
  // A desmontagem pode vir do próprio map.remove(), quando a style já não existe.
  const map = fakeMap();
  attachIsochroneLayers(map, { feature: FEATURE });
  detachIsochroneLayers(map);
  detachIsochroneLayers(map);
  detachIsochroneLayers(null);
  detachIsochroneLayers({});
});

test('a área não colide com as sources e layers do roteiro', () => {
  // Um id repetido faria a camada nova sobrescrever a do roteiro em silêncio.
  const planIds = new Set([
    ...planRoute.PLAN_LAYER_IDS,
    planRoute.PLAN_POINT_SOURCE_ID,
    planRoute.PLAN_LINE_SOURCE_ID,
  ]);
  for (const id of [...ISOCHRONE_LAYER_IDS, ISOCHRONE_SOURCE_ID]) {
    assert.equal(planIds.has(id), false, `${id} colide com o roteiro`);
  }
});
