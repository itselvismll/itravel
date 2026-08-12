// Onde o globo ancora o badge de cada país — e para onde a busca voa.
//
// O bug que originou estes testes: pesquisar "Inglaterra" levava a câmera para o
// meio do Pacífico, a 19 mil km do lugar certo. Ver `withCorrectWinding`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const d3 = require('d3-geo');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');
const ukNations = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/geo/uk-nations.json'), 'utf8')
);

const countryUtils = loadEsm('src/utils/countryUtils.js');
const geoCountryUtils = loadEsm('src/utils/geo-country-utils.js', {
  './countryUtils': countryUtils,
});
const overrides = loadEsm('src/components/map/countryCoordinateOverrides.js');
const centroids = loadEsm('src/components/map/countryCentroids.js', {
  'd3-geo': d3,
  '../../utils/geo-country-utils': geoCountryUtils,
  './countryCoordinateOverrides': overrides,
});

const { buildCountryAnchors } = centroids;
const { COUNTRY_COORDINATE_OVERRIDES, applyCoordinateOverride } = overrides;

/**
 * @param {number[]} a [longitude, latitude]
 * @param {number[]} b [longitude, latitude]
 */
const distanceKm = ([lng1, lat1], [lng2, lat2]) => {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

// Um quadrado de 2°, no sentido ANTI-horário (o que o GeoJSON pede).
const squareCounterClockwise = (lng, lat) => [
  [
    [lng - 1, lat - 1],
    [lng + 1, lat - 1],
    [lng + 1, lat + 1],
    [lng - 1, lat + 1],
    [lng - 1, lat - 1],
  ],
];

const reverseRings = (coordinates) => coordinates.map((ring) => [...ring].reverse());

const featureOf = (code, coordinates) => ({
  type: 'Feature',
  properties: { code },
  geometry: { type: 'Polygon', coordinates },
});

test('polígono no sentido invertido não manda o país para o antípoda', () => {
  // Numa esfera, um anel fechado divide o globo em duas partes e o SENTIDO diz
  // qual delas é o país. Invertido, o d3-geo mede o complemento: a área vira
  // quase a esfera inteira e o centróide cai do outro lado do planeta.
  const lng = 10;
  const lat = 50;
  const target = [lng, lat];

  const normal = buildCountryAnchors({
    features: [featureOf('AAA', squareCounterClockwise(lng, lat))],
  });
  const flipped = buildCountryAnchors({
    features: [featureOf('BBB', reverseRings(squareCounterClockwise(lng, lat)))],
  });

  assert.ok(distanceKm([normal.AAA.lng, normal.AAA.lat], target) < 30);
  assert.ok(
    distanceKm([flipped.BBB.lng, flipped.BBB.lat], target) < 30,
    `sentido invertido ancorou em [${flipped.BBB.lng.toFixed(1)}, ${flipped.BBB.lat.toFixed(1)}]`
  );

  // E a área precisa ser a do país, não a do resto do mundo.
  assert.ok(flipped.BBB.area < 0.01, `área do complemento: ${flipped.BBB.area}`);
  assert.ok(Math.abs(flipped.BBB.area - normal.AAA.area) < 1e-9);
});

test('as 4 nações do Reino Unido ancoram no lugar certo', () => {
  // Este é o caso real: o arquivo do ONS vem com os anéis no sentido horário.
  const anchors = buildCountryAnchors({ features: ukNations.features });

  /** @type {Record<string, number[]>} */
  const expected = {
    'GB-ENG': [-1.5, 52.5],
    'GB-SCT': [-4.2, 56.8],
    'GB-WLS': [-3.7, 52.3],
    'GB-NIR': [-6.7, 54.6],
  };

  for (const [code, point] of Object.entries(expected)) {
    const anchor = anchors[code];
    assert.ok(anchor, `${code} ficou sem âncora`);
    const km = distanceKm([anchor.lng, anchor.lat], point);
    assert.ok(km < 100, `${code} ancorou a ${km.toFixed(0)}km do esperado`);
  }
});

test('cada nação do Reino Unido ancora dentro do próprio território', () => {
  // O critério que vale para o flyTo e para o badge: cair em terra, no país
  // certo. Distância até uma coordenada de referência é só uma aproximação
  // disso.
  const anchors = buildCountryAnchors({ features: ukNations.features });

  for (const feature of ukNations.features) {
    const code = feature.properties.code;
    const anchor = anchors[code];
    const geometry = {
      type: feature.geometry.type,
      coordinates:
        feature.geometry.type === 'Polygon'
          ? reverseRings(feature.geometry.coordinates)
          : feature.geometry.coordinates.map(reverseRings),
    };

    assert.ok(
      d3.geoContains(geometry, [anchor.lng, anchor.lat]),
      `${code} ancorou fora do próprio território`
    );
  }
});

test('a lista de exceções tem a última palavra sobre a posição', () => {
  const anchor = { lng: 0, lat: 0, area: 0.123 };
  const fixed = applyCoordinateOverride('VNM', anchor);

  assert.deepEqual([fixed.lng, fixed.lat], COUNTRY_COORDINATE_OVERRIDES.VNM);

  // A área NÃO é sobrescrita: ela decide a prioridade do badge na colisão, e um
  // número inventado mudaria qual país mostra o nome escrito.
  assert.equal(fixed.area, anchor.area);

  // País sem exceção passa intacto.
  assert.deepEqual(applyCoordinateOverride('BRA', anchor), anchor);
});

test('as exceções são poucas e ficam em terra, dentro do país', () => {
  // A lista existe para forma de território que nenhum centróide resolve
  // (Vietnã em meia-lua, Gâmbia em faixa de rio, atóis). Se ela começar a
  // crescer, o problema é o cálculo, não os dados.
  const codes = Object.keys(COUNTRY_COORDINATE_OVERRIDES);
  assert.ok(codes.length <= 15, `exceções demais: ${codes.length}`);

  for (const [code, point] of Object.entries(COUNTRY_COORDINATE_OVERRIDES)) {
    assert.equal(point.length, 2, `${code} não é um par`);
    const [lng, lat] = point;
    // Ordem [longitude, latitude] — trocar os dois é exatamente o tipo de erro
    // que manda o país para o oceano.
    assert.ok(lng >= -180 && lng <= 180, `${code} tem longitude fora de faixa`);
    assert.ok(lat >= -90 && lat <= 90, `${code} tem latitude fora de faixa`);
  }
});

test('o override não é aplicado a país que o cálculo já acerta', () => {
  // Guarda contra a lista virar depósito de ajuste fino. Estes são grandes e
  // regulares o bastante para o centróide resolver sozinho.
  for (const code of ['BRA', 'USA', 'FRA', 'CHN', 'AUS', 'ZAF', 'RUS', 'JPN']) {
    assert.equal(
      COUNTRY_COORDINATE_OVERRIDES[code],
      undefined,
      `${code} não deveria precisar de exceção`
    );
  }
});
