// Reino Unido separado em Inglaterra, Escócia, País de Gales e Irlanda do Norte.
//
// O app já tratava as 4 como países independentes em tudo — dados estáticos,
// bandeira, conquistas, busca. O que faltava era a GEOMETRIA: o dataset mundial
// traz um polígono só, "United Kingdom", e por isso o mapa pintava o reino
// inteiro quando alguém marcava só a Escócia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');
const ukNations = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/geo/uk-nations.json'), 'utf8')
);

const countryUtils = loadEsm('src/utils/countryUtils.js');
const geoCountryUtils = loadEsm('src/utils/geo-country-utils.js', {
  './countryUtils': countryUtils,
});
const collision = loadEsm('src/components/map/badgeCollision.js');
const status = loadEsm('src/components/map/countryStatus.js', {
  '../../utils/countryUtils': countryUtils,
  './badgeCollision': collision,
});
const geoService = loadEsm('src/services/geoService.js', {
  '../data/geo/uk-nations.json': ukNations,
  '../utils/geo-country-utils': geoCountryUtils,
});

const centroids = loadEsm('src/components/map/countryCentroids.js', {
  'd3-geo': require('d3-geo'),
  '../../utils/geo-country-utils': geoCountryUtils,
  './countryCoordinateOverrides': loadEsm('src/components/map/countryCoordinateOverrides.js'),
});
const fill = loadEsm('src/components/map/countryFill.js', {
  '../../utils/constants': { COLORS: { primary: '#6C2BD9', white: '#FFFFFF' } },
  '../../utils/geo-country-utils': geoCountryUtils,
});

const { withUkNations, getUkNationsGeoData } = geoService;
const { expandUkNations, UK_NATION_CODES, toAlpha3Set } = status;
const NATIONS = ['GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR'];

const worldWith = (...codes) => ({
  type: 'FeatureCollection',
  features: codes.map((code) => ({
    type: 'Feature',
    properties: { 'ISO3166-1-Alpha-3': code, name: code },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  })),
});

test('o dataset local traz as 4 nações com código ISO 3166-2', () => {
  const codes = ukNations.features.map((f) => f.properties.code).sort();
  assert.deepEqual(codes, [...NATIONS].sort());

  for (const feature of ukNations.features) {
    assert.ok(feature.geometry?.coordinates?.length, `${feature.properties.code} sem geometria`);
  }
});

test('o Reino Unido sai da coleção e entra como 4 países', () => {
  const merged = withUkNations(worldWith('BRA', 'GBR', 'FRA'), getUkNationsGeoData());
  const codes = merged.features.map((f) => geoCountryUtils.getGeoCountryAlpha3(f));

  // O polígono único do reino não pode sobrar: ele se sobrepõe exatamente às 4
  // nações, e duas camadas no mesmo pixel fariam a cor depender da ordem das
  // features — marcar a Inglaterra pintaria (ou não) a ilha inteira.
  assert.equal(codes.includes('GBR'), false, 'o polígono do Reino Unido continuou na coleção');
  for (const code of NATIONS) assert.ok(codes.includes(code), `${code} não entrou`);

  // O resto do mundo passa intacto.
  assert.ok(codes.includes('BRA') && codes.includes('FRA'));
  assert.equal(merged.type, 'FeatureCollection');
});

test('cada nação vira uma âncora de badge própria', () => {
  const anchors = centroids.buildCountryAnchors(withUkNations(worldWith('BRA'), getUkNationsGeoData()));

  for (const code of NATIONS) {
    assert.ok(anchors[code], `${code} ficou sem âncora`);
    assert.ok(Number.isFinite(anchors[code].lat) && Number.isFinite(anchors[code].lng));
  }

  // As âncoras têm de ser distintas, senão os 4 badges empilham no mesmo ponto.
  const positions = new Set(NATIONS.map((c) => `${anchors[c].lng.toFixed(3)},${anchors[c].lat.toFixed(3)}`));
  assert.equal(positions.size, NATIONS.length);
});

test('a fill layer pinta só a nação marcada, não a ilha inteira', () => {
  const data = fill.buildCountryFillData(withUkNations(worldWith('BRA'), getUkNationsGeoData()));
  const evaluate = (expression, properties) => {
    if (!Array.isArray(expression)) return expression;
    const [op, ...args] = expression;
    if (op === 'literal') return args[0];
    if (op === 'get') return properties[args[0]];
    if (op === 'in') return evaluate(args[1], properties).includes(evaluate(args[0], properties));
    if (op === 'case') {
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (evaluate(args[i], properties)) return evaluate(args[i + 1], properties);
      }
      return evaluate(args[args.length - 1], properties);
    }
    throw new Error(op);
  };

  // Só a Escócia visitada.
  const color = fill.fillColorExpression(new Set(['GB-SCT']), new Set());
  const painted = data.features
    .filter((f) => evaluate(color, f.properties) === '#6C2BD9')
    .map((f) => f.properties.alpha3);

  assert.deepEqual(painted, ['GB-SCT']);
});

test('quem marcou o Reino Unido inteiro continua com as 4 nações pintadas', () => {
  // Migração de dados: o banco guarda o GBR que a pessoa salvou, mas o mapa não
  // tem mais onde desenhá-lo. Sem a expansão, a viagem sumiria da tela.
  const expanded = expandUkNations(new Set(['BRA', 'GBR']));

  for (const code of UK_NATION_CODES) assert.ok(expanded.has(code), `${code} não foi expandido`);
  assert.ok(expanded.has('BRA'));

  // Sem GBR na lista, nada é inventado.
  const untouched = expandUkNations(new Set(['BRA']));
  for (const code of UK_NATION_CODES) assert.equal(untouched.has(code), false);
});

test('marcar uma nação sozinha não marca as vizinhas', () => {
  const codes = toAlpha3Set([{ country_code: 'GB-WLS' }]);
  const expanded = expandUkNations(codes);

  assert.ok(expanded.has('GB-WLS'));
  assert.equal(expanded.has('GB-ENG'), false);
  assert.equal(expanded.has('GB-SCT'), false);
});

test('cada nação tem bandeira e nome próprios', () => {
  // A bandeira vem do flagcdn pelo alpha-2, e o nome do Intl. Os dois já sabem
  // lidar com os códigos de subdivisão — é o que faz o badge de "Escócia"
  // aparecer com a bandeira escocesa em vez do ícone de fallback.
  const expected = {
    'GB-ENG': ['gb-eng', 'Inglaterra'],
    'GB-SCT': ['gb-sct', 'Escócia'],
    'GB-WLS': ['gb-wls', 'País de Gales'],
    'GB-NIR': ['gb-nir', 'Irlanda do Norte'],
  };

  // O nome em inglês vem do próprio GeoJSON, que é como o globo monta o índice de
  // nomes (useGlobeCountries.buildNameIndex). Sem ele o badge mostraria "GB-ENG":
  // 'GB-ENG' não é um alpha-2 e o Intl não tem o que traduzir.
  const nameInDataset = Object.fromEntries(
    ukNations.features.map((f) => [f.properties.code, f.properties.name])
  );

  for (const [code, [alpha2, name]] of Object.entries(expected)) {
    assert.equal(countryUtils.getAlpha2(code), alpha2);
    assert.equal(countryUtils.getCountryNamePtByCode(code, nameInDataset[code]), name);
  }
});
