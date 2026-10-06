// Nome de país e de continente no idioma ativo — o gap que a extração de texto
// fixo (Fase 1) não cobria: `getCountryNamePtByCode` e `groupByContinent`
// calculavam o nome via Intl, mas com o locale PINADO em 'pt-BR'/'pt', então um
// usuário com o app em inglês via "Brazil" só por coincidência de o tile mandar
// isso — o nome do app (badge, busca, modal) continuava em português.
//
// `getCountryName` e `groupByContinent` agora recebem a tag de locale como
// PARÂMETRO, nunca lida de um "idioma atual" global — mesma regra de
// `formatDate`/`formatNumber`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');
const { countryUtilsDeps } = require('./helpers/countryUtilsDeps.cjs');

const countryUtils = loadEsm('src/utils/countryUtils.js', countryUtilsDeps());
const { getCountryName, getCountryNamePtByCode, buildCountryDirectory } = countryUtils;

const countriesStaticData = loadEsm('src/data/countriesStaticData.js');
const constants = loadEsm('src/utils/constants.js');
const continents = loadEsm('src/utils/countryContinents.js', {
  '../data/countriesStaticData': countriesStaticData,
  './countryUtils': countryUtils,
  './constants': constants,
});
const { groupByContinent, continentLabelKey, countryLabel } = continents;

// ─── 1. O nome muda com o locale ────────────────────────────────────────────

test('o nome do país muda com a tag, para o mesmo código', () => {
  assert.equal(getCountryName('BR', '', 'pt-BR'), 'Brasil');
  assert.equal(getCountryName('BR', '', 'en-US'), 'Brazil');
  assert.equal(getCountryName('BR', '', 'es-ES'), 'Brasil');

  assert.equal(getCountryName('DE', '', 'pt-BR'), 'Alemanha');
  assert.equal(getCountryName('DE', '', 'en-US'), 'Germany');
  assert.equal(getCountryName('DE', '', 'es-ES'), 'Alemania');

  assert.equal(getCountryName('JP', '', 'es-ES'), 'Japón');
});

test('aceita alpha-3 também, igual alpha-2, nos três idiomas', () => {
  for (const tag of ['pt-BR', 'en-US', 'es-ES']) {
    assert.equal(getCountryName('DEU', '', tag), getCountryName('DE', '', tag));
  }
});

test('sem tag, o padrão é pt-BR — como sempre foi', () => {
  assert.equal(getCountryName('BR', ''), 'Brasil');
  assert.equal(getCountryName('BR'), 'Brasil');
});

test('o alias depreciado continua existindo e sempre devolve PT', () => {
  // Ver o comentário @deprecated em countryUtils.js: mantido pelo risco de um
  // chamador fora da varredura do lote, nunca recebe tag.
  assert.equal(getCountryNamePtByCode('BR', ''), 'Brasil');
  assert.equal(getCountryNamePtByCode('DE', ''), 'Alemanha');
});

// ─── 2. Fallback gracioso para o que o Intl não tem ────────────────────────

test('código vazio, nulo ou não reconhecido cai no fallbackName, nunca undefined/vazio', () => {
  for (const tag of ['pt-BR', 'en-US', 'es-ES']) {
    assert.equal(getCountryName('', 'Terra do Nunca', tag), 'Terra do Nunca');
    assert.equal(getCountryName(null, 'Terra do Nunca', tag), 'Terra do Nunca');
    assert.equal(getCountryName(undefined, 'Terra do Nunca', tag), 'Terra do Nunca');
  }
});

test('sem fallbackName, o pior caso é o próprio código — nunca quebra', () => {
  for (const tag of ['pt-BR', 'en-US', 'es-ES']) {
    assert.equal(typeof getCountryName('XX', '', tag), 'string');
    assert.ok(getCountryName('XX', '', tag).length > 0);
  }
});

test('uma tag que o Intl não reconhece não derruba a função', () => {
  // `new Intl.DisplayNames(['nao-existe'])` lança RangeError — é exatamente o
  // catch que existe desde antes deste lote, só testado para os 3 idiomas novos.
  assert.doesNotThrow(() => getCountryName('BR', 'Brasil', 'idioma-invalido'));
  assert.equal(getCountryName('BR', 'Brasil', 'idioma-invalido'), 'Brasil');
});

// ─── 3. O caso especial do Reino Unido ──────────────────────────────────────

test('as 4 nações do Reino Unido têm nome próprio nos três idiomas — Intl não as reconhece', () => {
  // Confirma o achado do pedido: GB-ENG etc. são ISO 3166-2 (subdivisão), e
  // Intl.DisplayNames({type:'region'}) só entende ISO 3166-1 (país). Testado
  // direto para não depender de nenhum outro teste provar isto.
  assert.throws(() => new Intl.DisplayNames(['en-US'], { type: 'region' }).of('GB-ENG'));

  const esperado = {
    'GB-ENG': { 'pt-BR': 'Inglaterra', 'en-US': 'England', 'es-ES': 'Inglaterra' },
    'GB-SCT': { 'pt-BR': 'Escócia', 'en-US': 'Scotland', 'es-ES': 'Escocia' },
    'GB-WLS': { 'pt-BR': 'País de Gales', 'en-US': 'Wales', 'es-ES': 'Gales' },
    'GB-NIR': { 'pt-BR': 'Irlanda do Norte', 'en-US': 'Northern Ireland', 'es-ES': 'Irlanda del Norte' },
  };

  for (const [code, porIdioma] of Object.entries(esperado)) {
    for (const [tag, nome] of Object.entries(porIdioma)) {
      assert.equal(getCountryName(code, '', tag), nome, `${code} em ${tag}`);
    }
  }
});

test('nação do Reino Unido em minúsculo ou com espaço nas pontas ainda resolve', () => {
  assert.equal(getCountryName('gb-eng', '', 'en-US'), 'England');
  assert.equal(getCountryName('  GB-SCT  ', '', 'es-ES'), 'Escocia');
});

// ─── 4. Continentes: rótulo é chave, nunca texto cravado ───────────────────

test('o título da seção é uma chave de tradução, igual nos três idiomas (o valor muda na fase de tradução, não aqui)', () => {
  const sections = groupByContinent([{ country_code: 'BRA' }, { country_code: 'PRT' }], 'en-US');
  assert.ok(sections.every((s) => typeof s.titleKey === 'string' && s.titleKey.startsWith('countryList.continents.')));
});

test('dentro da seção, a ordem alfabética segue a tag pedida', () => {
  const countries = [{ country_code: 'ZAF' }, { country_code: 'EGY' }, { country_code: 'KEN' }];
  const emPt = groupByContinent(countries, 'pt-BR')[0].data.map((c) => countryLabel(c, 'pt-BR'));
  const emEn = groupByContinent(countries, 'en-US')[0].data.map((c) => countryLabel(c, 'en-US'));
  // Nomes diferentes por idioma podem ordenar diferente — o teste comprova que
  // CADA lista está ordenada na PRÓPRIA tag, não que as duas coincidem.
  assert.deepEqual(emPt, [...emPt].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.deepEqual(emEn, [...emEn].sort((a, b) => a.localeCompare(b, 'en-US')));
});

test('continentLabelKey tem fallback para código desconhecido', () => {
  assert.equal(continentLabelKey('nao-existe'), continentLabelKey('other'));
});

// ─── 5. buildCountryDirectory (base da busca em LocationAutocomplete/MultiDestinationSelector) ─

test('buildCountryDirectory muda de idioma e preserva o nome em inglês como reserva de busca', () => {
  const emPt = buildCountryDirectory('pt-BR');
  const emEn = buildCountryDirectory('en-US');
  const brasilPt = emPt.find((c) => c.code === 'BRA');
  const brasilEn = emEn.find((c) => c.code === 'BRA');

  assert.equal(brasilPt.name, 'Brasil');
  assert.equal(brasilEn.name, 'Brazil');
  // nameEn não muda: é a reserva de busca para quem digita em inglês mesmo com
  // o app em outro idioma.
  assert.equal(brasilPt.nameEn, brasilEn.nameEn);
});
