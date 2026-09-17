// A lista de "o que tem por perto", em duas metades:
//
//   1. mapboxPlaces.js — a conversa com a Search Box. A regra protegida aqui é a
//      MESMA de mapboxRouting.js e mapboxIsochrone.js: nada lança, toda decepção
//      do Mapbox vira `null`. A lista é um extra sobre um mapa que já funciona.
//
//   2. geoMeasure.js + nearbyPlaces.js — a regra pura: o que entra na folha, em
//      que ordem, e com quantos minutos a pé. Sem rede, sem mapa, sem React —
//      é a parte que a web e o app nativo compartilham inteira.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const MAPBOX_TOKEN = 'pk.test';

// O normalizador de texto vive no geoSearch, e é o MESMO que a busca de país usa
// — daí carregá-lo de verdade em vez de dublar: se a normalização mudar lá, a
// deduplicação da folha e a categorização mudam junto, e estes testes precisam
// enxergar isso.
const geoSearch = loadEsm('src/utils/geoSearch.js', {
  './countryUtils': loadEsm('src/utils/countryUtils.js'),
  'expo/fetch': { fetch: (/** @type {any} */ url, /** @type {any} */ init) => global.fetch(url, init) },
  '../data/brazilianMunicipalities.json': [],
});

const planGeography = loadEsm('src/utils/planGeography.js', {
  './geoSearch': geoSearch,
});

const load = (token = MAPBOX_TOKEN) =>
  loadEsm('src/services/mapboxPlaces.js', {
    '../utils/constants': { API_CONFIG: { MAPBOX_TOKEN: token } },
    '../utils/planGeography': planGeography,
  });

const places = load();
const { CANONICAL_CATEGORIES, CATEGORY_LABEL, fetchNearbyPlaces, resolveCategory } = places;

const geoMeasure = loadEsm('src/utils/geoMeasure.js');
const { distanceMeters, isInsidePolygon, walkingMinutes, geometryBounds } = geoMeasure;

const nearbyPlaces = loadEsm('src/utils/nearbyPlaces.js', {
  './geoMeasure': geoMeasure,
  './geoSearch': geoSearch,
  '../services/mapboxPlaces': places,
});
const { NEARBY_MAX_COUNT, selectNearbyPlaces } = nearbyPlaces;

/** Parada em Roma, no formato que o hook passa. */
const ORIGIN = { longitude: 12.4922, latitude: 41.8902, title: 'Coliseu' };

/** Quadrado de ~1 km em volta da origem, no papel de isócrona. */
const AREA = {
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [12.486, 41.885],
      [12.499, 41.885],
      [12.499, 41.896],
      [12.486, 41.896],
      [12.486, 41.885],
    ]],
  },
};

const place = (name, longitude, latitude, categoryIds = ['restaurant']) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [longitude, latitude] },
  properties: { mapbox_id: name, name, poi_category_ids: categoryIds },
});

const stubFetch = (handler) => {
  const original = global.fetch;
  const calls = [];
  global.fetch = /** @type {any} */ (async (/** @type {any} */ url, init) => {
    calls.push(String(url));
    return handler(String(url), init);
  });
  return { calls, restore: () => { global.fetch = original; } };
};

const ok = (features) => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features }) });

// ── O serviço ────────────────────────────────────────────────────────────────

test('a busca pede todas as categorias de uma vez, em português e com o recorte da área', async () => {
  const fetchStub = stubFetch(async () => ok([place('Trattoria', 12.49, 41.889)]));

  await fetchNearbyPlaces(
    { longitude: ORIGIN.longitude, latitude: ORIGIN.latitude },
    { bbox: [12.486, 41.885, 12.499, 41.896], limit: 10 }
  );

  const [url] = fetchStub.calls;
  fetchStub.restore();

  // Uma requisição só para as sete categorias: sete chamadas seriam sete idas à
  // rede para montar meia dúzia de linhas.
  for (const canonical of Object.keys(CANONICAL_CATEGORIES)) {
    assert.match(decodeURIComponent(url), new RegExp(canonical));
  }
  assert.match(url, /proximity=12\.4922%2C41\.8902/);
  assert.match(url, /language=pt/);
  assert.match(url, /bbox=12\.486%2C41\.885%2C12\.499%2C41\.896/);
});

test('cada decepção do Mapbox vira null, e nenhuma vira exceção', async () => {
  const semToken = load('');
  assert.equal(await semToken.fetchNearbyPlaces({ longitude: 1, latitude: 1 }), null);

  // Coordenada ausente não chega a ir à rede: `Number(null)` é 0, um valor
  // finito que buscaria lugares no golfo da Guiné.
  assert.equal(await fetchNearbyPlaces({ longitude: null, latitude: 41.9 }), null);
  assert.equal(await fetchNearbyPlaces(null), null);

  const erro = stubFetch(async () => ({ ok: false, status: 403, json: async () => ({}) }));
  assert.equal(await fetchNearbyPlaces({ longitude: 12.49, latitude: 41.89 }), null);
  erro.restore();

  const explode = stubFetch(async () => { throw new Error('rede caiu'); });
  assert.equal(await fetchNearbyPlaces({ longitude: 12.49, latitude: 41.89 }), null);
  explode.restore();

  const corpoEstranho = stubFetch(async () => ({ ok: true, json: async () => ({}) }));
  assert.equal(await fetchNearbyPlaces({ longitude: 12.49, latitude: 41.89 }), null);
  corpoEstranho.restore();
});

test('busca sem resultado é lista vazia, não falha — a folha diz coisas diferentes', async () => {
  const vazio = stubFetch(async () => ok([]));
  const result = await fetchNearbyPlaces({ longitude: 12.49, latitude: 41.89 });
  vazio.restore();

  assert.deepEqual(result, []);
});

test('lugar sem nome ou sem coordenada não vira linha em branco', async () => {
  const fetchStub = stubFetch(async () => ok([
    place('Trattoria', 12.49, 41.889),
    { type: 'Feature', geometry: { type: 'Point', coordinates: [12.49, 41.89] }, properties: { name: '  ' } },
    { type: 'Feature', geometry: null, properties: { name: 'Sem lugar' } },
  ]));

  const result = await fetchNearbyPlaces({ longitude: 12.49, latitude: 41.89 });
  fetchStub.restore();

  assert.deepEqual(result.map((item) => item.name), ['Trattoria']);
});

test('a categoria da API vira o vocabulário do app, com o título como último recurso', () => {
  assert.equal(resolveCategory({ poi_category_ids: ['museum'] }), 'atracao');
  assert.equal(resolveCategory({ poi_category_ids: ['bar', 'restaurant'] }), 'vida_noturna');

  // Categoria que não está na tabela cai no normalizeCategory que os roteiros
  // antigos já usavam — em vez de uma segunda tabela para manter em sincronia.
  assert.equal(
    resolveCategory({ poi_category_ids: ['zoo'], poi_category: ['parque'], name: 'Bioparco' }),
    'natureza'
  );
  assert.equal(resolveCategory({ name: 'Lugar qualquer' }), 'outro');
});

// ── A medida ─────────────────────────────────────────────────────────────────

test('a distância bate com a realidade, e o tempo a pé nunca é zero', () => {
  // Coliseu → Fórum Romano: ~600 m em linha reta.
  const meters = distanceMeters([12.4922, 41.8902], [12.4853, 41.8925]);
  assert.ok(meters > 500 && meters < 750, `esperava ~600 m, veio ${Math.round(meters)}`);

  assert.equal(walkingMinutes(0), 1, '"0 min a pé" lê como erro, não como "é logo ali"');
  assert.equal(walkingMinutes(800), 10);
  assert.ok(Number.isNaN(walkingMinutes(Number.NaN)));
  assert.ok(Number.isNaN(distanceMeters([12.49, 41.89], [null, 41.89])));
});

test('o buraco do polígono conta: o que a área exclui fica fora da lista', () => {
  const comBuraco = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  };

  assert.equal(isInsidePolygon([1, 1], comBuraco), true);
  // O quarteirão fechado no meio do bairro: dentro do contorno, fora do alcance.
  assert.equal(isInsidePolygon([5, 5], comBuraco), false);
  assert.equal(isInsidePolygon([20, 20], comBuraco), false);
  assert.equal(isInsidePolygon([null, 1], comBuraco), false);
  assert.equal(isInsidePolygon([1, 1], null), false);
});

test('a caixa da área é o que recorta a busca', () => {
  assert.deepEqual(geometryBounds(AREA.geometry), [12.486, 41.885, 12.499, 41.896]);
  assert.equal(geometryBounds(null), null);
  assert.equal(geometryBounds({ type: 'Point', coordinates: [1, 1] }), null);
});

// ── A regra da folha ─────────────────────────────────────────────────────────

const toPlaces = (features) => features.map((feature) => ({
  id: feature.properties.mapbox_id,
  name: feature.properties.name,
  category: resolveCategory(feature.properties),
  longitude: feature.geometry.coordinates[0],
  latitude: feature.geometry.coordinates[1],
}));

test('a lista sai do mais perto para o mais longe, com minutos a pé', () => {
  const result = selectNearbyPlaces(
    toPlaces([
      place('Longe', 12.4975, 41.8945),
      place('Perto', 12.4925, 41.8905),
      place('Médio', 12.4945, 41.8920),
    ]),
    { origin: ORIGIN, area: AREA }
  );

  assert.deepEqual(result.map((item) => item.name), ['Perto', 'Médio', 'Longe']);
  for (const item of result) {
    assert.ok(item.minutes >= 1);
    assert.equal(item.categoryLabel, CATEGORY_LABEL.restaurante);
  }
});

test('quem está fora da área não entra, mesmo estando perto em linha reta', () => {
  // Do outro lado do rio: 300 m de distância e vinte e poucos minutos de
  // caminhada. Uma lista que ignorasse a área contradiria o desenho no mapa.
  const result = selectNearbyPlaces(
    toPlaces([place('Do outro lado', 12.4700, 41.8902), place('Dentro', 12.4930, 41.8905)]),
    { origin: ORIGIN, area: AREA }
  );

  assert.deepEqual(result.map((item) => item.name), ['Dentro']);
});

test('sem área desenhada a lista ainda funciona, como "os mais próximos"', () => {
  const result = selectNearbyPlaces(
    toPlaces([place('Do outro lado', 12.4700, 41.8902), place('Dentro', 12.4930, 41.8905)]),
    { origin: ORIGIN, area: null }
  );

  assert.deepEqual(result.map((item) => item.name), ['Dentro', 'Do outro lado']);
});

test('a própria parada não aparece como vizinha dela mesma', () => {
  const result = selectNearbyPlaces(
    toPlaces([place('Coliseu', 12.4922, 41.8902), place('Trattoria', 12.4930, 41.8905)]),
    { origin: ORIGIN, area: AREA }
  );

  assert.deepEqual(result.map((item) => item.name), ['Trattoria']);
});

test('o mesmo lugar repetido fica uma vez só, na ocorrência mais próxima', () => {
  const result = selectNearbyPlaces(
    toPlaces([place('Mercado', 12.4960, 41.8935), place('Mercado', 12.4925, 41.8905)]),
    { origin: ORIGIN, area: AREA }
  );

  assert.equal(result.length, 1);
  assert.ok(result[0].meters < 100);
});

test('a lista tem teto: a folha complementa o mapa, não vira um guia da cidade', () => {
  const muitos = Array.from({ length: 30 }, (_, index) =>
    place(`Lugar ${index}`, 12.4925 + index * 0.00005, 41.8905));

  const result = selectNearbyPlaces(toPlaces(muitos), { origin: ORIGIN, area: AREA });

  assert.equal(result.length, NEARBY_MAX_COUNT);
});

test('entrada ausente devolve lista vazia, nunca exceção', () => {
  assert.deepEqual(selectNearbyPlaces(null, { origin: ORIGIN }), []);
  assert.deepEqual(selectNearbyPlaces([], { origin: null }), []);
});

test('o nome do estabelecimento é o real, não a versão localizada', () => {
  // `language=pt` traz categoria e endereço em português, mas também localiza o
  // nome quando existe uma versão traduzida. Nome próprio não se traduz: quem
  // procura a placa na rua precisa do nome da placa.
  const localizado = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [12.4925, 41.8905] },
    properties: {
      mapbox_id: 'x',
      name: 'Coliseu',
      name_preferred: 'Colosseo',
      poi_category_ids: ['tourist_attraction'],
    },
  };

  const fetchStub = stubFetch(async () => ok([localizado]));
  return fetchNearbyPlaces({ longitude: 12.49, latitude: 41.89 }).then((result) => {
    fetchStub.restore();
    assert.equal(result[0].name, 'Colosseo');
  });
});

test('sem nome canônico, vale o nome que veio — e nunca uma linha em branco', async () => {
  const fetchStub = stubFetch(async () => ok([
    place("Gagi's", 12.4925, 41.8905),
    { type: 'Feature', geometry: { type: 'Point', coordinates: [12.49, 41.89] }, properties: { name_preferred: '   ', name: 'Mikeli Trade' } },
  ]));

  const result = await fetchNearbyPlaces({ longitude: 12.49, latitude: 41.89 });
  fetchStub.restore();

  assert.deepEqual(result.map((item) => item.name), ["Gagi's", 'Mikeli Trade']);
});

// ── Rota a pé no app de mapas do aparelho ────────────────────────────────────

const mapsLink = loadEsm('src/utils/mapsLink.js', {
  './planGeography': planGeography,
});
const { walkingDirectionsUrl } = mapsLink;

const PLACE_FOR_LINK = { latitude: 41.8925, longitude: 12.4853, name: 'Fórum Romano' };

test('cada sistema recebe o app de mapas que ele tem instalado', () => {
  const ios = walkingDirectionsUrl(PLACE_FOR_LINK, 'ios');
  assert.match(ios, /^https:\/\/maps\.apple\.com\//);
  assert.match(ios, /daddr=41\.8925%2C12\.4853/);
  // `dirflg=w` é o modo a pé: sem ele o Apple Maps abre a rota de carro, que
  // para 600 metros é a resposta errada.
  assert.match(ios, /dirflg=w/);

  for (const os of ['android', 'web']) {
    const url = walkingDirectionsUrl(PLACE_FOR_LINK, os);
    assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\//);
    assert.match(url, /destination=41\.8925%2C12\.4853/);
    assert.match(url, /travelmode=walking/);
  }
});

test('o link é https nos três casos, para funcionar também no navegador', () => {
  // `maps://` e `comgooglemaps://` só existem no aparelho: no navegador eles
  // não abrem nada, em silêncio.
  for (const os of ['ios', 'android', 'web']) {
    assert.match(walkingDirectionsUrl(PLACE_FOR_LINK, os), /^https:/);
  }
});

test('lugar sem coordenada utilizável não vira link', () => {
  assert.equal(walkingDirectionsUrl(null), null);
  assert.equal(walkingDirectionsUrl({ latitude: null, longitude: 12.48 }), null);
  // (0, 0) é "Null Island": quase sempre um campo vazio, não um lugar.
  assert.equal(walkingDirectionsUrl({ latitude: 0, longitude: 0 }), null);
});
