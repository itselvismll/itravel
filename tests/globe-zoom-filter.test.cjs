// Exibição progressiva de badges por nível de zoom, em quatro degraus.
//
// O globo tem 238 países com badge. Mostrar todos de uma vez é ilegível, então o
// filtro de zoom decide quem entra em cena: destaques globais no globo inteiro,
// + os principais de cada continente no nível intermediário, tudo a partir da
// sub-região, e no nível de país todo mundo pode abrir o nome. Estes testes
// prendem os quatro degraus, a suavidade da progressão entre eles e a garantia
// de que os países do usuário nunca são cortados por essa curadoria.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const countryUtils = loadEsm('src/utils/countryUtils.js');
const collision = loadEsm('src/components/map/badgeCollision.js');
const status = loadEsm('src/components/map/countryStatus.js', {
  '../../utils/countryUtils': countryUtils,
  './badgeCollision': collision,
});
const featured = loadEsm('src/components/map/featuredCountries.js', {
  './countryStatus': status,
});

const { VISITED, WISHLIST, UNMARKED, isExpandable, renderedBadgeMode } = status;
const { EXPANDED, COMPACT } = collision;
const {
  FEATURED_COUNTRY_CODES,
  REGIONAL_COUNTRY_CODES,
  CONTINENT_ZOOM,
  SUBREGION_ZOOM,
  COUNTRY_ZOOM,
  expandsEveryBadge,
  isFeatured,
  isRegional,
  isUserCountry,
  passesZoomFilter,
} = featured;

const GLOBE_ZOOM = 0.8;
const REGIONAL_LIST = Object.values(REGIONAL_COUNTRY_CODES).flat();

test('a lista de destaque é enxuta, alpha-3 e sem repetição', () => {
  // O número importa: é ele que separa "o globo tem âncoras de leitura" de "o
  // globo virou uma parede de bandeiras".
  assert.ok(
    FEATURED_COUNTRY_CODES.length >= 20 && FEATURED_COUNTRY_CODES.length <= 30,
    `destaques demais ou de menos: ${FEATURED_COUNTRY_CODES.length}`
  );
  assert.equal(new Set(FEATURED_COUNTRY_CODES).size, FEATURED_COUNTRY_CODES.length);

  for (const code of FEATURED_COUNTRY_CODES) {
    assert.match(code, /^[A-Z]{3}$/, `${code} não é alpha-3 maiúsculo`);
  }

  // Cada continente precisa estar representado, senão uma região inteira fica
  // sem nenhuma âncora no zoom mais aberto.
  for (const anchor of ['BRA', 'USA', 'RUS', 'CHN', 'AUS', 'ZAF', 'FRA']) {
    assert.ok(isFeatured(anchor), `${anchor} saiu da lista de destaque`);
  }
});

test('no globo inteiro, só os destaques passam', () => {
  const featuredCountry = { code: 'BRA', status: UNMARKED };
  const ordinary = { code: 'AND', status: UNMARKED };

  assert.equal(passesZoomFilter(featuredCountry, GLOBE_ZOOM), true);
  assert.equal(passesZoomFilter(ordinary, GLOBE_ZOOM), false);
});

test('o tier 2 não repete o tier 1 e cobre todos os continentes', () => {
  assert.equal(new Set(REGIONAL_LIST).size, REGIONAL_LIST.length, 'código repetido no tier 2');

  for (const code of REGIONAL_LIST) {
    assert.match(code, /^[A-Z]{3}$/, `${code} não é alpha-3 maiúsculo`);
    // Um destaque global repetido aqui não quebraria nada, mas mentiria sobre o
    // tamanho de cada degrau — a lista é o que o tier 2 ACRESCENTA.
    assert.equal(isFeatured(code), false, `${code} já é destaque global`);
  }

  for (const continent of ['southAmerica', 'northAmerica', 'europe', 'africa', 'asia', 'oceania']) {
    assert.ok(REGIONAL_COUNTRY_CODES[continent]?.length > 0, `${continent} ficou sem tier 2`);
  }

  // O exemplo do briefing: no nível de continente a América do Sul mostra Chile
  // e Venezuela, mas ainda não Suriname, Guiana e Paraguai.
  for (const code of ['CHL', 'VEN', 'BOL']) assert.ok(isRegional(code), `${code} saiu do tier 2`);
  for (const code of ['SUR', 'GUY', 'PRY']) {
    assert.equal(isRegional(code), false, `${code} não deveria aparecer no nível de continente`);
  }
});

test('no nível de continente entram os principais, não todos', () => {
  const zoom = 2.5;
  const regional = { code: 'CHL', status: UNMARKED };
  const small = { code: 'SUR', status: UNMARKED };

  assert.equal(passesZoomFilter({ code: 'BRA', status: UNMARKED }, zoom), true);
  assert.equal(passesZoomFilter(regional, zoom), true);
  assert.equal(passesZoomFilter(small, zoom), false);

  // Os limites são fechados embaixo: um décimo antes ainda é o nível anterior.
  assert.equal(passesZoomFilter(regional, CONTINENT_ZOOM), true);
  assert.equal(passesZoomFilter(regional, CONTINENT_ZOOM - 0.1), false);
});

test('a partir da sub-região, todo país do viewport passa', () => {
  const small = { code: 'SUR', status: UNMARKED };

  assert.equal(passesZoomFilter(small, SUBREGION_ZOOM), true);
  assert.equal(passesZoomFilter(small, COUNTRY_ZOOM), true);
  assert.equal(passesZoomFilter(small, 12), true);
  assert.equal(passesZoomFilter(small, SUBREGION_ZOOM - 0.1), false);
});

test('só o nível de país abre o nome de quem não está marcado', () => {
  const unmarked = { code: 'SUR', status: UNMARKED };

  assert.equal(expandsEveryBadge(SUBREGION_ZOOM), false);
  assert.equal(expandsEveryBadge(COUNTRY_ZOOM), true);
  assert.equal(expandsEveryBadge(undefined), false);

  const allowUnmarked = expandsEveryBadge(COUNTRY_ZOOM);
  assert.equal(isExpandable(unmarked, { allowUnmarked }), true);
  assert.equal(renderedBadgeMode(unmarked, EXPANDED, { allowUnmarked }), EXPANDED);

  // Mesmo de perto, a colisão continua mandando: quem não cabe vira pill.
  assert.equal(renderedBadgeMode(unmarked, COMPACT, { allowUnmarked }), COMPACT);

  // E um degrau antes nada mudou para o não marcado.
  assert.equal(isExpandable(unmarked), false);
  assert.equal(renderedBadgeMode(unmarked, EXPANDED), COMPACT);
});

test('país do usuário passa em qualquer zoom, destaque ou não', () => {
  const visited = { code: 'AND', status: VISITED };
  const wishlist = { code: 'VUT', status: WISHLIST };

  assert.ok(!isFeatured('AND') && !isFeatured('VUT'), 'o teste precisa de países fora da lista');

  for (const zoom of [0, GLOBE_ZOOM, CONTINENT_ZOOM, COUNTRY_ZOOM]) {
    assert.equal(passesZoomFilter(visited, zoom), true, `visitado sumiu no zoom ${zoom}`);
    assert.equal(passesZoomFilter(wishlist, zoom), true, `wishlist sumiu no zoom ${zoom}`);
  }

  assert.equal(isUserCountry(visited), true);
  assert.equal(isUserCountry(wishlist), true);
  assert.equal(isUserCountry({ status: UNMARKED }), false);
  assert.equal(isUserCountry(undefined), false);
});

test('sem zoom conhecido, cai na regra mais conservadora', () => {
  // Antes do primeiro quadro o mapa pode não ter zoom ainda. Errar para o lado
  // do globo aberto mostra 25 badges a mais; errar para o outro lado mostraria
  // 238.
  const ordinary = { code: 'AND', status: UNMARKED };

  assert.equal(passesZoomFilter(ordinary, undefined), false);
  assert.equal(passesZoomFilter(ordinary, NaN), false);
  assert.equal(passesZoomFilter({ code: 'BRA', status: UNMARKED }, undefined), true);
});

// Mundo sintético do tamanho real: os 25 destaques, o tier 2 inteiro e o resto
// preenchido com países anônimos, como no globo de quem acabou de criar a conta.
const buildWorld = () => {
  const world = [
    ...FEATURED_COUNTRY_CODES.map((code) => ({ code, status: UNMARKED })),
    ...REGIONAL_LIST.map((code) => ({ code, status: UNMARKED })),
  ];

  for (let index = world.length; index < 238; index += 1) {
    world.push({ code: `X${String(index).padStart(3, '0')}`, status: UNMARKED });
  }

  return world;
};

test('os quatro níveis crescem em degraus, sem salto de poucos para muitos', () => {
  const world = buildWorld();
  const countAt = (zoom) => world.filter((country) => passesZoomFilter(country, zoom)).length;

  const globe = countAt(GLOBE_ZOOM);
  const continent = countAt(2.5);
  const subregion = countAt(4);
  const country = countAt(6);

  assert.equal(globe, FEATURED_COUNTRY_CODES.length);
  assert.equal(continent, FEATURED_COUNTRY_CODES.length + REGIONAL_LIST.length);
  assert.equal(subregion, world.length);
  assert.equal(country, world.length);

  // Cada degrau é estritamente maior que o anterior: o filtro nunca tira um país
  // de cena quando a câmera se aproxima.
  assert.ok(globe < continent && continent < subregion, `${globe} -> ${continent} -> ${subregion}`);

  // E nenhum degrau multiplica a cena por mais de ~4x. É esta a régua do
  // "inundou a tela": antes do nível intermediário o pulo do globo direto para
  // tudo era de 25 para 238, quase 10x de uma vez.
  assert.ok(continent / globe <= 4, `salto do globo para o continente: ${continent / globe}x`);
  assert.ok(
    subregion / continent <= 4,
    `salto do continente para a sub-região: ${subregion / continent}x`
  );
});

test('o viewport é quem separa a sub-região do nível de país', () => {
  // Os dois níveis mais próximos deixam o mesmo conjunto passar de propósito: o
  // que muda entre eles é a área visível (que encolhe com o zoom) e a leitura
  // dos badges, não a curadoria.
  const world = buildWorld();

  for (const country of world) {
    assert.equal(passesZoomFilter(country, SUBREGION_ZOOM), passesZoomFilter(country, 8));
  }

  assert.equal(expandsEveryBadge(SUBREGION_ZOOM), false);
  assert.equal(expandsEveryBadge(8), true);
});

test('em nenhum nível um país marcado fica de fora', () => {
  const world = buildWorld().map((country, index) =>
    index % 7 === 0 ? { ...country, status: VISITED } : country
  );
  const marked = world.filter((country) => country.status === VISITED);

  for (const zoom of [0, GLOBE_ZOOM, CONTINENT_ZOOM, 2.5, SUBREGION_ZOOM, COUNTRY_ZOOM, 9]) {
    const shown = world.filter((country) => passesZoomFilter(country, zoom));
    for (const country of marked) {
      assert.ok(shown.includes(country), `${country.code} sumiu no zoom ${zoom}`);
    }
  }
});
