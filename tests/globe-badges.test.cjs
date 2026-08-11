// O globo mostra o mundo inteiro: todo país com código ISO tem badge, e o que
// muda entre visitado, wishlist e não marcado é o estilo e a prioridade.
//
// Estes testes exercitam a lista completa (~240 países) contra a colisão, que é
// o caso que a amostra de 10 nunca chegou perto de cobrir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const countryUtils = loadEsm('src/utils/countryUtils.js');
const collision = loadEsm('src/components/map/badgeCollision.js');
const status = loadEsm('src/components/map/countryStatus.js', {
  '../../utils/countryUtils': countryUtils,
  './badgeCollision': collision,
});

const {
  VISITED,
  WISHLIST,
  UNMARKED,
  buildGlobeCountries,
  toAlpha3Set,
  badgePriority,
  isExpandable,
  renderedBadgeMode,
} = status;
const { resolveBadgeModes, EXPANDED, COMPACT } = collision;

// Geometria de badge igual à do componente (CountryBadge exporta estes números).
const BADGE_HEIGHT = 29;
const COMPACT_BADGE_WIDTH = 38;

// Âncoras sintéticas espalhadas pelo mundo, na mesma quantidade que o GeoJSON
// real entrega (238 países com código ISO reconhecido). Espalhadas com o ângulo
// áureo para dar uma distribuição parecida com a real: aglomerados densos e
// vazios grandes, e não uma grade regular que a colisão resolveria fácil demais.
const buildAnchors = (count = 238) => {
  const anchors = {};
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / (count - 1)) * 2;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lng = (((golden * index) % (2 * Math.PI)) * 180) / Math.PI - 180;
    const code = `X${String(index).padStart(3, '0')}`;
    anchors[code] = { lng, lat, area: 0.001 + (index % 50) / 500 };
  }

  return anchors;
};

/**
 * Projeção ortográfica: é o que a projeção globe do MapLibre faz no zoom de
 * globo. Devolve x/y em pixels e se o ponto está no hemisfério da frente.
 */
const project = (country, { radius = 320, cx = 600, cy = 400, centerLng = 0, centerLat = 20 }) => {
  const toRad = Math.PI / 180;
  const lat = country.lat * toRad;
  const lng = (country.lng - centerLng) * toRad;
  const lat0 = centerLat * toRad;

  const cosC =
    Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(lng);

  return {
    x: cx + radius * Math.cos(lat) * Math.sin(lng),
    y: cy - radius * (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(lng)),
    visible: cosC >= 0,
  };
};

// Réplica do que CountryBadgeMarkers monta antes de chamar a colisão.
const toCandidates = (countries, view = {}) =>
  countries.map((country) => {
    const point = project(country, view);
    const expandedWidth = isExpandable(country)
      ? COMPACT_BADGE_WIDTH + 7 + country.name.length * 7
      : COMPACT_BADGE_WIDTH;

    return {
      key: country.code,
      x: point.x,
      y: point.y,
      visible: point.visible,
      expandedWidth,
      compactWidth: COMPACT_BADGE_WIDTH,
      height: BADGE_HEIGHT,
      priority: badgePriority(country),
    };
  });

const nameOf = (code) => `País ${code}`;

test('todo país do GeoJSON entra na lista, marcado ou não', () => {
  const anchors = buildAnchors();
  const countries = buildGlobeCountries(anchors, {
    visited: new Set(['X001', 'X002']),
    wishlist: new Set(['X003']),
    nameOf,
  });

  assert.equal(countries.length, Object.keys(anchors).length);
  assert.equal(countries.length, 238);

  const byStatus = (wanted) => countries.filter((country) => country.status === wanted).length;
  assert.equal(byStatus(VISITED), 2);
  assert.equal(byStatus(WISHLIST), 1);
  assert.equal(byStatus(UNMARKED), 235);
});

test('visitado vence wishlist quando o país está nas duas listas', () => {
  const countries = buildGlobeCountries(
    { BRA: { lng: -50, lat: -12, area: 0.2 } },
    { visited: new Set(['BRA']), wishlist: new Set(['BRA']), nameOf }
  );

  assert.equal(countries[0].status, VISITED);
});

test('códigos alpha-2 do banco viram alpha-3 antes de virar status', () => {
  // visited_countries e wishlist guardam ora alpha-2, ora alpha-3, conforme por
  // onde o país foi marcado; as âncoras são todas alpha-3.
  const codes = toAlpha3Set([{ country_code: 'br' }, { country_code: 'PRT' }, 'jp']);

  assert.ok(codes.has('BRA'));
  assert.ok(codes.has('PRT'));
  assert.ok(codes.has('JPN'));
});

test('status manda na prioridade, área só desempata dentro do mesmo status', () => {
  const tinyVisited = { status: VISITED, area: 0.0001 };
  const hugeUnmarked = { status: UNMARKED, area: 0.42 };
  const hugeWishlist = { status: WISHLIST, area: 0.42 };

  assert.ok(badgePriority(tinyVisited) > badgePriority(hugeWishlist));
  assert.ok(badgePriority(hugeWishlist) > badgePriority(hugeUnmarked));
  assert.ok(
    badgePriority({ status: VISITED, area: 0.3 }) > badgePriority({ status: VISITED, area: 0.1 })
  );
});

test('só país marcado pode abrir o nome', () => {
  assert.equal(isExpandable({ status: VISITED }), true);
  assert.equal(isExpandable({ status: WISHLIST }), true);
  assert.equal(isExpandable({ status: UNMARKED }), false);
  assert.equal(isExpandable({}), false);
});

test('no zoom de globo, todos os países da frente ficam representados', () => {
  const countries = buildGlobeCountries(buildAnchors(), {
    visited: new Set(['X010', 'X050', 'X090', 'X130', 'X170', 'X210']),
    wishlist: new Set(['X020', 'X060', 'X100']),
    nameOf,
  });

  const candidates = toCandidates(countries);
  const modes = resolveBadgeModes(candidates);

  // Nenhum país fica sem estado — nem os do lado escondido da esfera.
  assert.equal(Object.keys(modes).length, countries.length);
  for (const country of countries) {
    assert.ok(
      modes[country.code] === EXPANDED || modes[country.code] === COMPACT,
      `${country.code} ficou sem badge`
    );
  }

  // E os visíveis são a maior parte: metade do globo, mais a silhueta.
  const visible = candidates.filter((candidate) => candidate.visible);
  assert.ok(visible.length > 100, `poucos países visíveis: ${visible.length}`);
});

test('país não marcado nunca rouba o espaço de um visitado', () => {
  // Um visitado minúsculo cercado de países grandes não marcados. Sem a
  // prioridade por status, a área dos vizinhos ganharia e o visitado — a única
  // coisa que a pessoa marcou — viraria pill.
  const anchors = {
    VIS: { lng: 0, lat: 0, area: 0.0001 },
    BIG: { lng: 0.4, lat: 0, area: 0.42 },
    BGR: { lng: -0.4, lat: 0, area: 0.4 },
  };
  const countries = buildGlobeCountries(anchors, { visited: new Set(['VIS']), nameOf });
  const modes = resolveBadgeModes(toCandidates(countries));

  assert.equal(modes.VIS, EXPANDED);
});

test('com o globo inteiro na tela, só os marcados aparecem escritos', () => {
  const marked = ['X010', 'X050', 'X090', 'X130', 'X170', 'X210'];
  const countries = buildGlobeCountries(buildAnchors(), {
    visited: new Set(marked),
    nameOf,
  });

  const modes = resolveBadgeModes(toCandidates(countries));

  // A colisão devolve "expandido" para muitos não marcados — eles disputam com a
  // largura de um pill, então quase sempre cabem. O que vale é o estado
  // DESENHADO, e nele nenhum país não marcado mostra o nome.
  const drawnExpanded = countries.filter(
    (country) => renderedBadgeMode(country, modes[country.code]) === EXPANDED
  );

  assert.ok(drawnExpanded.length > 0, 'nenhum badge escrito no globo');
  for (const country of drawnExpanded) {
    assert.equal(country.status, VISITED, `${country.code} apareceu escrito sem ser marcado`);
  }
});

test('o estado desenhado nunca mostra o nome de um país não marcado', () => {
  const unmarked = { status: UNMARKED };

  assert.equal(renderedBadgeMode(unmarked, EXPANDED), COMPACT);
  assert.equal(renderedBadgeMode(unmarked, COMPACT), COMPACT);
  assert.equal(renderedBadgeMode(unmarked, undefined), COMPACT);

  // Marcado segue o que a colisão decidiu, e nasce escrito quando ainda não há
  // decisão — é assim que a largura do nome chega a ser medida.
  assert.equal(renderedBadgeMode({ status: VISITED }, undefined), EXPANDED);
  assert.equal(renderedBadgeMode({ status: VISITED }, COMPACT), COMPACT);
  assert.equal(renderedBadgeMode({ status: WISHLIST }, EXPANDED), EXPANDED);
});

test('aproximar o zoom devolve o nome a quem estava em pill', () => {
  const countries = buildGlobeCountries(buildAnchors(), {
    visited: new Set(['X010', 'X011', 'X012', 'X013', 'X014']),
    nameOf,
  });
  const marked = countries.filter((country) => country.status === VISITED);

  const expandedCount = (radius) => {
    const modes = resolveBadgeModes(toCandidates(countries, { radius }));
    return marked.filter((country) => modes[country.code] === EXPANDED).length;
  };

  // Mesma cena, globo 6x maior na tela: a folga entre os badges cresce junto.
  assert.ok(
    expandedCount(2000) >= expandedCount(320),
    'aproximar o zoom não deveria fechar badges'
  );
  assert.equal(expandedCount(2000), marked.length);
});

test('o cálculo com o mundo inteiro cabe no orçamento de um quadro', () => {
  const countries = buildGlobeCountries(buildAnchors(), {
    visited: new Set(['X010', 'X050', 'X090']),
    wishlist: new Set(['X020', 'X060']),
    nameOf,
  });

  // 240 quadros ~ 4 segundos de arrasto contínuo a 60fps, girando o globo.
  const frames = 240;
  const started = process.hrtime.bigint();
  let previous = {};
  for (let frame = 0; frame < frames; frame += 1) {
    const candidates = toCandidates(countries, { centerLng: (frame * 1.5) % 360 });
    previous = resolveBadgeModes(candidates, { previous });
  }
  const perFrameMs = Number(process.hrtime.bigint() - started) / 1e6 / frames;

  // Um quadro a 60fps tem 16,7ms para TUDO. O limite aqui é folgado de
  // propósito: serve para pegar uma regressão de ordem de grandeza (voltar ao
  // O(n²) sem grid, por exemplo), não para cravar um número de máquina.
  assert.ok(perFrameMs < 4, `colisão levou ${perFrameMs.toFixed(2)}ms por quadro`);
});
