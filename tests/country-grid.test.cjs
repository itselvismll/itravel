// O corte "ver mais" das listas de países do perfil.
//
// Duas metades puras, e é por isso que elas moram fora dos componentes:
//
//   1. countryContinents.js — de que continente é cada país, como agrupar e como
//      buscar por nome. A busca é o ponto sensível: ela tem de achar "África"
//      para quem digitou "africa", que é como as pessoas realmente digitam.
//
//   2. countryGridData.js — quantas etiquetas cabem e quantas sobram. A conta do
//      "+N" tem uma armadilha de um a mais: o card ocupa um slot, então o nono
//      país não fica escondido atrás dele, fica DENTRO da conta.
//
// A renderização não é testada aqui de propósito — ela é visual e fica para a
// conferência na tela.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const countryUtils = loadEsm('src/utils/countryUtils.js');
const countriesStaticData = loadEsm('src/data/countriesStaticData.js');

const continents = loadEsm('src/utils/countryContinents.js', {
  '../data/countriesStaticData': countriesStaticData,
  './countryUtils': countryUtils,
});
const gridData = loadEsm('src/components/profile/countryGridData.js');

const {
  CONTINENT_ORDER,
  CONTINENT_PT,
  UNKNOWN_CONTINENT,
  countryLabel,
  filterCountries,
  getContinentPt,
  groupByContinent,
  normalizeSearch,
} = continents;

const { GRID_LIMIT, countryKey, gridSlots, tagRotation } = gridData;

/** Item no formato do passaporte. */
const visited = (code, name = '') => ({ country_code: code, country_name: name });

// ── 1. Continentes ───────────────────────────────────────────────────────────

test('os cinco region do dataset viram os cinco continentes em português', () => {
  assert.deepEqual(CONTINENT_PT, {
    Africa: 'África',
    Americas: 'Américas',
    Asia: 'Ásia',
    Europe: 'Europa',
    Oceania: 'Oceania',
  });
});

const POR_CONTINENTE = [
  ['BRA', 'Américas'],
  ['USA', 'Américas'],
  ['PRT', 'Europa'],
  ['DEU', 'Europa'],
  ['JPN', 'Ásia'],
  ['ZAF', 'África'],
  ['EGY', 'África'],
  ['AUS', 'Oceania'],
];

for (const [code, expected] of POR_CONTINENTE) {
  test(`${code} é ${expected}`, () => {
    assert.equal(getContinentPt(code), expected);
  });
}

test('alpha-2 e alpha-3 dão o mesmo continente', () => {
  // As duas listas do perfil guardam o código em formatos que variam com a
  // origem do registro; ler só um deles jogaria metade dos países em "Outros".
  assert.equal(getContinentPt('BR'), getContinentPt('BRA'));
  assert.equal(getContinentPt('br'), 'Américas');
  assert.equal(getContinentPt('pt'), 'Europa');
});

const SEM_CONTINENTE = [undefined, null, '', 'ZZ', 'XYZ', 'não é código'];

for (const code of SEM_CONTINENTE) {
  test(`código sem continente cai em Outros: ${JSON.stringify(code)}`, () => {
    // O país NÃO some da lista: um registro que a tela mostra mas o agrupamento
    // descarta seria um país que o usuário marcou e não consegue mais encontrar.
    assert.equal(getContinentPt(code), UNKNOWN_CONTINENT);
  });
}

test('todo país do dataset tem continente conhecido', () => {
  // Trava o contrato com o dataset: um `region` novo (ou renomeado) numa
  // atualização do COUNTRIES_STATIC jogaria países silenciosamente em "Outros".
  const semContinente = Object.keys(countriesStaticData.COUNTRIES_STATIC)
    .filter((code) => getContinentPt(code) === UNKNOWN_CONTINENT);
  assert.deepEqual(semContinente, []);
});

// ── 2. Busca ─────────────────────────────────────────────────────────────────

test('a normalização tira acento, caixa e espaço das pontas', () => {
  assert.equal(normalizeSearch('  ÁFRICA  '), 'africa');
  assert.equal(normalizeSearch('São Tomé'), 'sao tome');
  assert.equal(normalizeSearch(null), '');
});

const BUSCAS = [
  ['sem acento acha com acento', 'africa do sul'],
  ['caixa alta acha', 'ÁFRICA DO SUL'],
  ['caixa mista acha', 'ÁfRiCa Do SuL'],
  ['acento acha acento', 'África do Sul'],
  ['trecho do meio acha', 'do sul'],
  ['espaço nas pontas não atrapalha', '  africa  '],
];

for (const [label, query] of BUSCAS) {
  test(`busca: ${label}`, () => {
    const found = filterCountries([visited('ZAF'), visited('BRA')], query);
    assert.equal(found.length, 1);
    assert.equal(found[0].country_code, 'ZAF');
  });
}

test('busca vazia devolve a lista inteira', () => {
  // O campo começa vazio: uma lista vazia ao abrir o modal pareceria dado
  // faltando, não filtro sem termo.
  const list = [visited('BRA'), visited('PRT')];
  assert.deepEqual(filterCountries(list, ''), list);
  assert.deepEqual(filterCountries(list, '   '), list);
  assert.deepEqual(filterCountries(list, undefined), list);
});

test('busca sem correspondência devolve lista vazia, sem estourar', () => {
  assert.deepEqual(filterCountries([visited('BRA')], 'zzzz'), []);
  assert.deepEqual(filterCountries(null, 'brasil'), []);
});

test('a busca casa com o nome em PORTUGUÊS, que é o que está na tela', () => {
  // Buscar "Germany" não pode achar a Alemanha: o usuário lê "Alemanha" no
  // card e é essa palavra que ele digita.
  const list = [visited('DEU')];
  assert.equal(countryLabel(list[0]), 'Alemanha');
  assert.equal(filterCountries(list, 'alemanha').length, 1);
  assert.equal(filterCountries(list, 'germany').length, 0);
});

test('o country_name do registro serve de reserva para código irreconhecível', () => {
  const item = { country_code: 'XYZ', country_name: 'Terra do Nunca' };
  assert.equal(countryLabel(item), 'Terra do Nunca');
  assert.equal(filterCountries([item], 'nunca').length, 1);
});

test('um alpha-2 desconhecido vira o rótulo do CLDR, não o country_name', () => {
  // Comportamento do getCountryNamePtByCode, que é compartilhado com o resto do
  // app: o Intl.DisplayNames resolve 'ZZ' para o nome CLDR de região
  // desconhecida, e nunca chega a olhar o `country_name`. Registrado aqui
  // porque é surpreendente — e porque um dia alguém vai debugar por que a
  // reserva "não funcionou" justamente nesse caso.
  const item = { country_code: 'ZZ', country_name: 'Terra do Nunca' };
  assert.equal(countryLabel(item), 'Região desconhecida');
  // O país não some da lista: ele aparece, agrupado em "Outros".
  assert.equal(getContinentPt('ZZ'), UNKNOWN_CONTINENT);
});

// ── 3. Agrupamento ───────────────────────────────────────────────────────────

test('o agrupamento sai na ordem fixa dos continentes, não alfabética', () => {
  // Alfabética poria África antes de Américas e Ásia — três seções em A, numa
  // ordem que não diz nada. A ordem fixa é a de leitura de um mapa-múndi.
  const sections = groupByContinent([
    visited('AUS'), visited('JPN'), visited('ZAF'), visited('PRT'), visited('BRA'),
  ]);
  assert.deepEqual(sections.map((s) => s.title), ['Américas', 'Europa', 'África', 'Ásia', 'Oceania']);
});

test('continente sem país não vira seção vazia', () => {
  const sections = groupByContinent([visited('BRA'), visited('ARG')]);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].title, 'Américas');
  assert.equal(sections[0].data.length, 2);
});

test('dentro da seção, os países saem em ordem alfabética do nome em PT', () => {
  // Pelo código seria DEU, ESP, PRT — "Alemanha, Espanha, Portugal" só por
  // sorte. Com AUT no meio a ordem por código quebraria de forma visível.
  const sections = groupByContinent([visited('PRT'), visited('DEU'), visited('ESP'), visited('AUT')]);
  assert.deepEqual(
    sections[0].data.map(countryLabel),
    ['Alemanha', 'Áustria', 'Espanha', 'Portugal']
  );
});

test('a ordem alfabética ignora acento: Áustria vem depois de Alemanha', () => {
  const sections = groupByContinent([visited('AUT'), visited('DEU')]);
  assert.deepEqual(sections[0].data.map(countryLabel), ['Alemanha', 'Áustria']);
});

test('Outros fecha a lista, depois de todos os continentes reais', () => {
  const sections = groupByContinent([visited('ZZ', 'Ilha Perdida'), visited('BRA'), visited('JPN')]);
  assert.deepEqual(sections.map((s) => s.title), ['Américas', 'Ásia', UNKNOWN_CONTINENT]);
  assert.equal(CONTINENT_ORDER[CONTINENT_ORDER.length - 1], UNKNOWN_CONTINENT);
});

test('lista vazia ou ausente não vira seção nenhuma', () => {
  assert.deepEqual(groupByContinent([]), []);
  assert.deepEqual(groupByContinent(null), []);
  assert.deepEqual(groupByContinent(undefined), []);
});

test('o agrupamento não perde nem duplica país', () => {
  const list = [
    visited('BRA'), visited('USA'), visited('PRT'), visited('DEU'),
    visited('JPN'), visited('ZAF'), visited('AUS'), visited('ZZ', 'Desconhecido'),
  ];
  const total = groupByContinent(list).reduce((sum, s) => sum + s.data.length, 0);
  assert.equal(total, list.length);
});

test('o agrupamento não muta a lista recebida', () => {
  // A lista vem do estado da tela: ordená-la no lugar reordenaria o grid do
  // perfil como efeito colateral de abrir o modal.
  const list = [visited('PRT'), visited('DEU')];
  const antes = list.map((c) => c.country_code);
  groupByContinent(list);
  assert.deepEqual(list.map((c) => c.country_code), antes);
});

// ── 4. Corte do grid ─────────────────────────────────────────────────────────

test('o limite do grid é 9 (3x3)', () => {
  assert.equal(GRID_LIMIT, 9);
});

const CORTES = /** @type {Array<[number, number, number, boolean]>} */ ([
  // [tamanho da lista, etiquetas visíveis, N do card, tem card?]
  [0, 0, 0, false],
  [1, 1, 0, false],
  [8, 8, 0, false],
  // Exatamente 9 cabe inteiro: trocar o nono país por um "+1" gastaria um slot
  // para esconder um único item.
  [9, 9, 0, false],
  // A partir daqui o card ocupa o nono slot, então sobram 8 etiquetas.
  [10, 8, 2, true],
  [12, 8, 4, true],
  [50, 8, 42, true],
  [195, 8, 187, true],
]);

for (const [size, expectedVisible, expectedRemaining, expectedHasMore] of CORTES) {
  test(`lista de ${size} país(es): ${expectedVisible} visíveis, +${expectedRemaining}`, () => {
    const list = Array.from({ length: size }, (_, i) => visited(`C${i}`));
    const { visible, remaining, hasMore } = gridSlots(list);

    assert.equal(visible.length, expectedVisible);
    assert.equal(remaining, expectedRemaining);
    assert.equal(hasMore, expectedHasMore);

    // A conta tem de fechar: nada de país que não está visível nem contado.
    assert.equal(visible.length + remaining, size);
    // E nunca mais de 9 coisas no grid (etiquetas + o card).
    assert.ok(visible.length + (hasMore ? 1 : 0) <= GRID_LIMIT);
  });
}

test('as etiquetas visíveis são as primeiras da lista, na ordem', () => {
  const list = Array.from({ length: 20 }, (_, i) => visited(`C${i}`));
  const { visible } = gridSlots(list);
  assert.deepEqual(visible.map((c) => c.country_code), [
    'C0', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
  ]);
});

test('gridSlots não muta nem copia a lista quando ela cabe inteira', () => {
  const list = [visited('BRA')];
  const { visible } = gridSlots(list);
  assert.equal(visible, list);
});

test('lista ausente não estoura', () => {
  assert.deepEqual(gridSlots(null), { visible: [], remaining: 0, hasMore: false });
  assert.deepEqual(gridSlots(undefined), { visible: [], remaining: 0, hasMore: false });
});

test('um limite diferente muda o corte pela mesma regra', () => {
  const list = Array.from({ length: 10 }, (_, i) => visited(`C${i}`));
  const { visible, remaining } = gridSlots(list, 4);
  assert.equal(visible.length, 3);
  assert.equal(remaining, 7);
  assert.equal(visible.length + remaining, list.length);
});

// ── 5. Chave dos itens ───────────────────────────────────────────────────────

test('a chave sai do country_code no passaporte e do id na wishlist', () => {
  // Um componente só serve as duas listas porque a chave lê os dois formatos —
  // sem uma prop dizendo "sou o passaporte".
  assert.equal(countryKey({ country_code: 'BRA' }, 0), 'BRA');
  assert.equal(countryKey({ id: 42, country_code: undefined }, 0), '42');
});

test('o country_code ganha do id quando os dois existem', () => {
  // É o que identifica o país na tela, e é estável entre recarregamentos.
  assert.equal(countryKey({ id: 42, country_code: 'BRA' }, 0), 'BRA');
});

test('item sem código nem id cai no índice, sem repetir chave', () => {
  // Chave repetida embaralha a lista no React em silêncio.
  const chaves = [{}, {}, {}].map(countryKey);
  assert.equal(new Set(chaves).size, 3);
});

test('a rotação alterna nos quatro ângulos originais', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(tagRotation), [-4, 3, -3, 4, -4, 3]);
});

test('o card +N herda a rotação do slot que ocupa', () => {
  // Um card reto no meio das etiquetas tortas leria como elemento de outro tipo
  // antes de o usuário chegar no texto.
  const { visible } = gridSlots(Array.from({ length: 20 }, (_, i) => visited(`C${i}`)));
  assert.equal(tagRotation(visible.length), tagRotation(8));
  assert.notEqual(tagRotation(visible.length), 0);
});
