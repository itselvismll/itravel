// Garante que todo lugar do roteiro sai com coordenada válida, categoria dentro do enum
// e ordem sequencial — tanto na Edge Function (fonte da verdade) quanto no espelho do
// client, que blinda roteiros antigos e a prévia local.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const babel = require('@babel/core');
const { loadEsm } = require('./helpers/load-esm.cjs');

const root = path.resolve(__dirname, '..');
const FUNCTION_PATH = 'supabase/functions/travel-assistant/index.ts';

const CATEGORIES = [
  'restaurante', 'atracao', 'compras', 'hotel',
  'transporte', 'natureza', 'vida_noturna', 'outro',
];

// A Edge Function roda em Deno: transpilamos o TypeScript e injetamos os globais que ela
// espera (serve, Deno.env, fetch) para exercitar a normalização em processo.
const loadEdgeFunction = (fetchImpl) => {
  const filename = path.join(root, FUNCTION_PATH);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-typescript', { onlyRemoveTypeImports: false }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });

  const sandboxFetch = fetchImpl || (async () => { throw new Error('rede não esperada'); });
  const factory = vm.runInThisContext(
    `(function (exports, module, require, Deno, fetch) {\n${code}\n})`,
    { filename }
  );
  const loaded = { exports: {} };
  factory(
    loaded.exports,
    loaded,
    (specifier) => {
      if (specifier.includes('deno.land')) return { serve: () => {} };
      throw new Error(`dependência não fornecida: ${specifier}`);
    },
    { env: { get: () => '' } },
    sandboxFetch
  );
  return loaded.exports;
};

const RIO = { latitude: -22.9068, longitude: -43.1729 };

const buildPlan = (activities) => ({
  days: [{ day: 1, activities }],
});

const liveContext = {
  place: { name: 'Rio de Janeiro', ...RIO },
  realPlaces: [
    {
      name: 'Confeitaria Colombo',
      category: 'restaurante',
      latitude: -22.9053,
      longitude: -43.1791,
      provider: 'Google Places',
    },
  ],
};

test('edge function: coordenada válida da IA é preservada e a ordem é reescrita', async () => {
  const { normalizePlanGeography } = loadEdgeFunction();
  const plan = buildPlan([
    { title: 'Pão de Açúcar', latitude: -22.9492, longitude: -43.1545, category: 'passeio', order: 7 },
    { title: 'Praia de Copacabana', latitude: -22.9711, longitude: -43.1822, category: 'praia', order: 7 },
  ]);

  const summary = await normalizePlanGeography(plan, liveContext, { allowRadiusCheck: true });
  const [first, second] = plan.days[0].activities;

  assert.equal(summary.fromModel, 2);
  assert.equal(first.latitude, -22.9492);
  assert.deepEqual([first.order, second.order], [1, 2]);
  assert.deepEqual([first.day, second.day], [1, 1]);
  // 'passeio' e 'praia' vêm do vocabulário dos realPlaces e precisam cair no enum fechado.
  assert.equal(first.category, 'atracao');
  assert.equal(second.category, 'natureza');
});

test('edge function: coordenada ausente, nula ou absurda cai no realPlaces sem rede', async () => {
  const { normalizePlanGeography } = loadEdgeFunction();
  const plan = buildPlan([
    { title: 'Café na Confeitaria Colombo', mapQuery: 'Confeitaria Colombo, Rio de Janeiro' },
    { title: 'Confeitaria Colombo', latitude: 0, longitude: 0 },
    { title: 'Confeitaria Colombo', latitude: 48.8584, longitude: 2.2945 },
  ]);

  const summary = await normalizePlanGeography(plan, liveContext, { allowRadiusCheck: true });

  assert.equal(summary.fromRealPlaces, 3, 'ausente, (0,0) e fora do raio devem usar o fallback local');
  assert.equal(summary.missing, 0);
  for (const activity of plan.days[0].activities) {
    assert.equal(activity.latitude, -22.9053);
    assert.equal(activity.coordinateSource, 'Google Places');
    assert.equal(activity.category, 'restaurante');
  }
});

test('edge function: destino multi-país não aplica o raio de sanidade', async () => {
  const { normalizePlanGeography } = loadEdgeFunction();
  const plan = buildPlan([{ title: 'Torre Eiffel', latitude: 48.8584, longitude: 2.2945 }]);

  const summary = await normalizePlanGeography(plan, liveContext, { allowRadiusCheck: false });

  assert.equal(summary.fromModel, 1);
  assert.equal(plan.days[0].activities[0].latitude, 48.8584);
});

test('edge function: o que sobra vai para o geocoding em um único batch limitado', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({ features: [{ geometry: { coordinates: [-43.2105, -22.9519] } }] }),
    };
  };
  const { normalizePlanGeography } = loadEdgeFunction(fetchImpl);
  const plan = buildPlan(Array.from({ length: 20 }, (_, index) => ({
    title: `Lugar desconhecido ${index}`,
    mapQuery: `lugar ${index}, Rio de Janeiro, Brasil`,
  })));

  const summary = await normalizePlanGeography(plan, liveContext, { allowRadiusCheck: true });

  assert.equal(calls.length, 12, 'o batch de geocoding é limitado para caber no timeout do client');
  assert.equal(summary.fromGeocoding, 12);
  // Os que não couberam no batch herdam o destino, marcados como aproximados.
  const approximate = plan.days[0].activities.filter((item) => item.approximateCoordinate);
  assert.equal(approximate.length, 8);
  assert.equal(summary.missing, 8);

  // Nenhum ponto pode ficar sem coordenada — é a garantia de que o globo depende.
  for (const activity of plan.days[0].activities) {
    assert.ok(Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude));
    assert.ok(CATEGORIES.includes(activity.category));
  }
});

test('edge function: falha de rede no geocoding não derruba o roteiro', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const { normalizePlanGeography } = loadEdgeFunction(fetchImpl);
  const plan = buildPlan([{ title: 'Lugar sem dados', mapQuery: 'algo, Rio de Janeiro' }]);

  const summary = await normalizePlanGeography(plan, liveContext, { allowRadiusCheck: true });

  assert.equal(summary.missing, 1);
  assert.equal(plan.days[0].activities[0].latitude, RIO.latitude);
  assert.equal(plan.days[0].activities[0].approximateCoordinate, true);
});

test('schema e prompt exigem coordenada, categoria do enum e ordem', () => {
  const handler = fs.readFileSync(path.join(root, FUNCTION_PATH), 'utf8');
  assert.match(handler, /required: \['period'[^\]]*'latitude', 'longitude', 'category', 'order'\]/);
  assert.match(handler, /category: \{ type: 'STRING', enum: \[\.\.\.PLACE_CATEGORIES\] \}/);
  assert.match(handler, /order: \{ type: 'INTEGER' \}/);
  assert.match(handler, /latitude e longitude reais/);
  for (const category of CATEGORIES) {
    assert.ok(handler.includes(`'${category}'`), `enum precisa conter ${category}`);
  }
});

// ─── Espelho no client ───────────────────────────────────────────────────────

const loadPlanGeography = (searchCities) => loadEsm('src/utils/planGeography.js', {
  './geoSearch': {
    normalizeSearchText: (value) => (value || '')
      .normalize('NFD')
      .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
      .toLowerCase()
      .trim(),
    searchCities: searchCities || (async () => []),
  },
});

test('client: ensurePlanCoordinates normaliza sem rede e não muta o original', async () => {
  const { ensurePlanCoordinates } = loadPlanGeography();
  const legacy = buildPlan([
    { title: 'Jantar no centro', latitude: -22.9, longitude: -43.2, order: 9 },
    { title: 'Museu do Amanhã', latitude: 'x', longitude: null },
  ]);

  const next = await ensurePlanCoordinates(legacy);

  assert.equal(next.days[0].activities[0].order, 1);
  assert.equal(next.days[0].activities[0].category, 'restaurante');
  // Sem category no dado antigo, o título é a única pista disponível.
  assert.equal(next.days[0].activities[1].category, 'atracao');
  assert.equal(legacy.days[0].activities[0].order, 9, 'o plano recebido não pode ser mutado');
});

test('client: geocode preenche o que falta e o destino é o último recurso', async () => {
  const { ensurePlanCoordinates, getPlanPoints } = loadPlanGeography(
    async (query) => (query.includes('conhecido')
      ? [{ lat: -22.95, lng: -43.21 }]
      : [])
  );
  const plan = buildPlan([
    { title: 'Lugar conhecido', mapQuery: 'lugar conhecido, Rio' },
    { title: 'Lugar sem match', mapQuery: 'nada, Rio' },
  ]);

  const next = await ensurePlanCoordinates(plan, {
    geocode: true,
    fallbackCoordinate: RIO,
  });

  assert.equal(next.days[0].activities[0].latitude, -22.95);
  assert.equal(next.days[0].activities[1].latitude, RIO.latitude);
  assert.equal(next.days[0].activities[1].approximateCoordinate, true);

  const points = getPlanPoints(next);
  assert.equal(points.length, 2);
  assert.deepEqual(points.map((point) => point.order), [1, 2]);
});

test('client: getPlanPoints ordena por dia e sequência e descarta Null Island', () => {
  const { getPlanPoints } = loadPlanGeography();
  const points = getPlanPoints({
    days: [
      { day: 2, activities: [{ title: 'B', latitude: -22.9, longitude: -43.2 }] },
      { day: 1, activities: [
        { title: 'A', latitude: -22.8, longitude: -43.1 },
        { title: 'Vazio', latitude: 0, longitude: 0 },
      ] },
    ],
  });

  assert.deepEqual(points.map((point) => point.title), ['A', 'B']);
});
