// Ordem e traçado do roteiro pelas APIs do Mapbox.
//
// O que estes testes protegem, acima de tudo, é o FALLBACK. A camada de exibição
// do roteiro não pode depender de rede: um roteiro salvo tem de aparecer no
// globo com o token vencido, a cota estourada, a rede caída ou a resposta
// truncada. Cada caso de falha aqui é um jeito de o Mapbox decepcionar, e a
// resposta certa é sempre a mesma — os pontos na ordem que a IA mandou.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const MAPBOX_TOKEN = 'pk.test';

const load = () =>
  loadEsm('src/services/mapboxRouting.js', {
    '../utils/constants': { API_CONFIG: { MAPBOX_TOKEN } },
  });

const routing = load();
const {
  optimizePointOrder,
  fetchRouteGeometry,
  buildPlanRoutes,
  groupPointsByDay,
  OPTIMIZATION_MAX_COORDINATES,
  DIRECTIONS_MAX_COORDINATES,
} = routing;

/** Ponto no formato que getPlanPoints devolve. */
const point = (day, order, longitude = -9.1 - order / 100, latitude = 38.7 + order / 100) => ({
  day,
  order,
  title: `Parada ${order}`,
  category: 'atracao',
  latitude,
  longitude,
});

/**
 * Troca o `fetch` global por um dublê e devolve as URLs que ele viu.
 *
 * @param {(url: string) => any} handler resposta por URL: objeto = corpo JSON,
 *   número = status HTTP de erro, Error = falha de rede.
 */
const withFetch = (handler) => {
  const calls = [];
  const original = global.fetch;
  // O dublê responde só o que mapboxRouting lê (`ok` e `json`), não a Response
  // inteira do padrão — daí o cast.
  global.fetch = /** @type {any} */ (async (/** @type {any} */ url) => {
    calls.push(String(url));
    const result = handler(String(url));
    if (result instanceof Error) throw result;
    if (typeof result === 'number') return { ok: false, status: result, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => result };
  });
  return { calls, restore: () => { global.fetch = original; } };
};

const okTrip = (indices) => ({
  code: 'Ok',
  waypoints: indices.map((waypoint_index) => ({ waypoint_index })),
});

const okRoute = (coordinates) => ({
  code: 'Ok',
  routes: [{ geometry: { type: 'LineString', coordinates } }],
});

// ── Optimization ─────────────────────────────────────────────────────────────

test('a ordem otimizada é lida do waypoint_index, não da ordem da resposta', () => {
  // `waypoints` volta na ordem em que ENVIAMOS; quem diz a posição na viagem é o
  // waypoint_index de cada um. Ler a resposta como se já viesse ordenada é o
  // erro clássico desta API — e daria um trajeto plausível, mas errado.
  const points = [point(1, 1), point(1, 2), point(1, 3), point(1, 4)];
  const fake = withFetch(() => okTrip([0, 3, 1, 2]));

  return optimizePointOrder(points).then(({ points: ordered, optimized }) => {
    fake.restore();
    assert.equal(optimized, true);
    // Enviado [1,2,3,4] com índices [0,3,1,2] → visita 1, 3, 4, 2.
    assert.deepEqual(ordered.map((p) => p.order), [1, 3, 4, 2]);
  });
});

test('a primeira e a última parada do dia ficam onde a IA colocou', async () => {
  // Só `source=first&destination=last&roundtrip=false` é aceito pela API com
  // viagem aberta — e é também o que respeita o roteiro: a IA escolheu onde o
  // dia começa e termina, e isso não é ineficiência a corrigir.
  const fake = withFetch(() => okTrip([0, 1, 2]));
  await optimizePointOrder([point(1, 1), point(1, 2), point(1, 3)]);
  fake.restore();

  const url = fake.calls[0];
  assert.match(url, /optimized-trips\/v1\/mapbox\/driving\//);
  assert.match(url, /source=first/);
  assert.match(url, /destination=last/);
  assert.match(url, /roundtrip=false/);
  // lng,lat — o inverso da ordem com que o resto do app trabalha.
  assert.match(url, /driving\/-9\.11,38\.71;/);
});

test('resposta imprestável devolve a ordem da IA, sem lançar', async () => {
  const points = [point(1, 1), point(1, 2), point(1, 3)];
  const original = points.map((p) => p.order);

  /** @type {Array<[string, (url: string) => any]>} */
  const casos = [
    ['HTTP 403 (token restrito a outro domínio)', () => 403],
    ['HTTP 429 (cota estourada)', () => 429],
    ['falha de rede', () => new Error('offline')],
    ['code diferente de Ok, com HTTP 200', () => ({ code: 'NoTrips', waypoints: [] })],
    ['corpo sem waypoints', () => ({ code: 'Ok' })],
    ['waypoints a menos', () => okTrip([0, 1])],
    ['índice fora da faixa', () => okTrip([0, 1, 9])],
    ['índice repetido', () => okTrip([0, 1, 1])],
    ['índice não inteiro', () => okTrip([0, 1, 'x'])],
  ];

  for (const [nome, handler] of casos) {
    const fake = withFetch(handler);
    const { points: ordered, optimized } = await optimizePointOrder(points);
    fake.restore();

    assert.equal(optimized, false, `${nome}: não podia dizer que otimizou`);
    assert.deepEqual(ordered.map((p) => p.order), original, `${nome}: perdeu a ordem da IA`);
    assert.equal(ordered.length, points.length, `${nome}: sumiu com uma parada`);
  }
});

test('dia grande demais para a API nem sai da máquina', async () => {
  // O teto de 12 é da Optimization. Passar disso devolveria erro; quebrar o dia
  // em pedaços daria uma ordem pior que a original, com um salto no meio.
  const points = Array.from({ length: OPTIMIZATION_MAX_COORDINATES + 1 }, (_, i) => point(1, i + 1));
  const fake = withFetch(() => okTrip([]));

  const { optimized } = await optimizePointOrder(points);
  fake.restore();

  assert.equal(optimized, false);
  assert.equal(fake.calls.length, 0, 'gastou uma requisição fadada ao erro');
});

test('menos de dois pontos não é trajeto', async () => {
  const fake = withFetch(() => okTrip([0]));
  const um = await optimizePointOrder([point(1, 1)]);
  const nenhum = await optimizePointOrder([]);
  fake.restore();

  assert.equal(um.optimized, false);
  assert.equal(nenhum.optimized, false);
  assert.equal(fake.calls.length, 0);
});

test('sem token nenhuma requisição sai', async () => {
  const semToken = loadEsm('src/services/mapboxRouting.js', {
    '../utils/constants': { API_CONFIG: { MAPBOX_TOKEN: '' } },
  });
  const fake = withFetch(() => okTrip([0, 1]));

  const { optimized } = await semToken.optimizePointOrder([point(1, 1), point(1, 2)]);
  const geometry = await semToken.fetchRouteGeometry([point(1, 1), point(1, 2)]);
  fake.restore();

  assert.equal(optimized, false);
  assert.equal(geometry, null);
  assert.equal(fake.calls.length, 0, 'pediu tile com access_token vazio');
});

// ── Directions ───────────────────────────────────────────────────────────────

test('a geometria da rota vem do Directions em GeoJSON completo', async () => {
  const linha = [[-9.1, 38.7], [-9.11, 38.71], [-9.12, 38.72]];
  const fake = withFetch(() => okRoute(linha));

  const coordinates = await fetchRouteGeometry([point(1, 1), point(1, 2)]);
  fake.restore();

  assert.deepEqual(coordinates, linha);
  assert.match(fake.calls[0], /directions\/v5\/mapbox\/driving\//);
  // Sem os dois, a linha sairia codificada e simplificada — e no zoom de rua a
  // curva não seria a da via.
  assert.match(fake.calls[0], /geometries=geojson/);
  assert.match(fake.calls[0], /overview=full/);
});

test('rota que falha devolve null, para a linha reta assumir', async () => {
  for (const handler of [
    () => 403,
    () => new Error('offline'),
    () => ({ code: 'NoRoute', routes: [] }),
    () => ({ code: 'Ok', routes: [] }),
    () => okRoute([[-9.1, 38.7]]),
  ]) {
    const fake = withFetch(handler);
    const coordinates = await fetchRouteGeometry([point(1, 1), point(1, 2)]);
    fake.restore();
    assert.equal(coordinates, null);
  }
});

test('dia acima do teto do Directions é dividido sem buraco na emenda', async () => {
  // 26 pontos passam de 25: viram dois trechos. O ponto da emenda é pedido nos
  // dois, e a coordenada dele entra na linha UMA vez — senão a rota teria um
  // degrau visível bem no meio do dia.
  const points = Array.from({ length: DIRECTIONS_MAX_COORDINATES + 1 }, (_, i) => point(1, i + 1));
  const fake = withFetch((url) =>
    url.includes(';') && url.split(';').length > 20
      ? okRoute([[0, 0], [1, 1], [2, 2]])
      : okRoute([[2, 2], [3, 3]])
  );

  const coordinates = await fetchRouteGeometry(points);
  fake.restore();

  assert.equal(fake.calls.length, 2, 'devia ter partido em dois trechos');
  assert.deepEqual(coordinates, [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test('um trecho que falha derruba a rota inteira', async () => {
  // Meia rota é pior que nenhuma: parece um trajeto completo que simplesmente
  // ignora metade do dia.
  const points = Array.from({ length: DIRECTIONS_MAX_COORDINATES + 1 }, (_, i) => point(1, i + 1));
  let chamada = 0;
  const fake = withFetch(() => {
    chamada += 1;
    return chamada === 1 ? okRoute([[0, 0], [1, 1]]) : 500;
  });

  const coordinates = await fetchRouteGeometry(points);
  fake.restore();

  assert.equal(coordinates, null);
});

// ── Roteiro inteiro ──────────────────────────────────────────────────────────

test('cada dia é otimizado e traçado por conta própria', async () => {
  const points = [point(1, 1), point(1, 2), point(2, 1), point(2, 2)];
  const fake = withFetch((url) =>
    url.includes('optimized-trips') ? okTrip([0, 1]) : okRoute([[0, 0], [1, 1]])
  );

  const routes = await buildPlanRoutes(points);
  fake.restore();

  assert.deepEqual([...routes.keys()], [1, 2]);
  for (const day of [1, 2]) {
    assert.equal(routes.get(day).optimized, true);
    assert.equal(routes.get(day).routed, true);
    assert.equal(routes.get(day).points.length, 2);
  }
  // Duas chamadas por dia: uma de ordem, uma de traçado.
  assert.equal(fake.calls.length, 4);
});

test('um dia que falha não contamina os outros', async () => {
  const points = [point(1, 1), point(1, 2), point(2, 1), point(2, 2)];
  // O dia 1 é o primeiro par de chamadas; derrubar só ele prova que o
  // isolamento é por dia, e não do roteiro inteiro.
  let chamada = 0;
  const fake = withFetch((url) => {
    chamada += 1;
    if (chamada <= 2) return 500;
    return url.includes('optimized-trips') ? okTrip([1, 0]) : okRoute([[0, 0], [1, 1]]);
  });

  const routes = await buildPlanRoutes(points);
  fake.restore();

  assert.equal(routes.get(1).optimized, false);
  assert.equal(routes.get(1).routed, false);
  assert.equal(routes.get(1).coordinates, null);
  // E o dia 1 continua com as duas paradas, na ordem da IA.
  assert.deepEqual(routes.get(1).points.map((p) => p.order), [1, 2]);

  assert.equal(routes.get(2).optimized, true);
  assert.equal(routes.get(2).routed, true);
});

test('o roteiro reporta cada dia assim que ele fica pronto', async () => {
  // O mapa já está desenhado quando estas chamadas saem; segurar o dia 1 pronto
  // esperando o dia 14 atrasaria o refinamento sem motivo.
  const points = [point(1, 1), point(1, 2), point(2, 1), point(2, 2), point(3, 1), point(3, 2)];
  const fake = withFetch((url) =>
    url.includes('optimized-trips') ? okTrip([0, 1]) : okRoute([[0, 0], [1, 1]])
  );

  const vistos = [];
  await buildPlanRoutes(points, { onDay: (day) => vistos.push(day) });
  fake.restore();

  assert.deepEqual(vistos, [1, 2, 3]);
});

test('cancelar interrompe o roteiro no meio', async () => {
  const points = [point(1, 1), point(1, 2), point(2, 1), point(2, 2)];
  const controller = new AbortController();
  const fake = withFetch((url) => {
    // Aborta assim que o dia 1 terminou.
    if (url.includes('directions')) controller.abort();
    return url.includes('optimized-trips') ? okTrip([0, 1]) : okRoute([[0, 0], [1, 1]]);
  });

  const routes = await buildPlanRoutes(points, { signal: controller.signal });
  fake.restore();

  assert.equal(routes.has(2), false, 'seguiu trabalhando depois do abort');
});

test('o agrupamento por dia preserva a ordem da IA', () => {
  const byDay = groupPointsByDay([point(2, 1), point(1, 1), point(1, 2), point(2, 2)]);

  assert.deepEqual([...byDay.get(1)].map((p) => p.order), [1, 2]);
  assert.deepEqual([...byDay.get(2)].map((p) => p.order), [1, 2]);
  // Ponto sem dia cai no dia 1, e não num dia "0" que não existe no roteiro.
  assert.deepEqual([...groupPointsByDay([{ order: 1 }]).keys()], [1]);
});
