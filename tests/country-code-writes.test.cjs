// Nenhum ponto de escrita pode gravar country_code em formato desconhecido.
//
// O DEFEITO QUE ISTO TRAVA
//
// `country_photos`, `visited_countries` e `wishlist` acumularam alpha-2 e alpha-3
// misturados na mesma coluna. A causa não era o `|| codigo_cru` que aparecia nos
// três pontos de escrita — era `getAlpha3`, que NUNCA falha: a última linha dela é
// `return code.toUpperCase()`, então `getAlpha3('XX')` devolve 'XX'. O código cru
// entrava no banco com cara de normalizado, e o `||` quase nunca chegava a rodar.
//
// As leituras do app compensam a mistura até hoje (countryCodeVariants,
// possibleCodes), o que manteve o problema invisível — ele só aparece ao AGREGAR:
// um `group by country_code` conta a Argentina duas vezes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const countryUtils = loadEsm('src/utils/countryUtils.js', {});
const { toStorableCountryCode, getAlpha3, ALPHA3_TO_ALPHA2, UK_NATION_CODES } = countryUtils;

/**
 * A regra: um código gravável é um alpha-3 que o app conhece, OU uma das 4
 * nações do Reino Unido.
 *
 * Não é "tem 3 caracteres". Essa regra erraria nos dois sentidos: deixaria passar
 * 'XYZ' (que não é país) e recusaria 'GB-ENG' (que é país para este app, com
 * geometria, bandeira e conquista próprias).
 */
const ehGravavel = (code) =>
  typeof code === 'string' &&
  (UK_NATION_CODES.includes(code) || code in ALPHA3_TO_ALPHA2);

test('getAlpha3 não serve para decidir o que gravar — e é por isso que existe toStorableCountryCode', () => {
  // Esta é a premissa do bug. Se um dia getAlpha3 passar a devolver null para
  // código desconhecido, este teste falha e o helper pode ser simplificado.
  assert.equal(getAlpha3('XX'), 'XX', 'premissa: getAlpha3 devolve o código cru');
  assert.equal(getAlpha3('XYZ'), 'XYZ');

  // O helper novo recusa os dois.
  assert.equal(toStorableCountryCode('XX'), null);
  assert.equal(toStorableCountryCode('XYZ'), null);
});

test('toStorableCountryCode converte alpha-2, aceita alpha-3 e preserva nação do Reino Unido', () => {
  const casos = [
    ['BR', 'BRA'], ['br', 'BRA'], ['  br  ', 'BRA'], ['BRA', 'BRA'], ['bra', 'BRA'],
    ['US', 'USA'], ['fr', 'FRA'], ['JP', 'JPN'],
    // As 4 nações passam intactas — converter apagaria o recurso.
    ['GB-ENG', 'GB-ENG'], ['gb-eng', 'GB-ENG'], ['GB-SCT', 'GB-SCT'],
    ['GB-WLS', 'GB-WLS'], ['GB-NIR', 'GB-NIR'],
    // Reino Unido como país segue sendo GBR.
    ['GB', 'GBR'], ['GBR', 'GBR'],
  ];

  for (const [entrada, esperado] of casos) {
    assert.equal(toStorableCountryCode(entrada), esperado, `entrada ${JSON.stringify(entrada)}`);
  }
});

test('o que não é país reconhecido vira null, nunca um valor gravável', () => {
  for (const entrada of ['XX', 'ZZ', 'XYZ', 'Q', '', '   ', null, undefined, 42, {}, []]) {
    assert.equal(
      toStorableCountryCode(entrada),
      null,
      `${JSON.stringify(entrada)} não deveria virar código gravável`
    );
  }
});

test('todo alpha-2 do mapa do app converte para um alpha-3 gravável', () => {
  // Varredura completa: os 250 países que o app conhece precisam sobreviver à
  // normalização, nas duas formas de entrada.
  for (const [alpha3, alpha2] of Object.entries(ALPHA3_TO_ALPHA2)) {
    const deAlpha2 = toStorableCountryCode(alpha2);
    const deAlpha3 = toStorableCountryCode(alpha3);

    assert.equal(deAlpha2, alpha3, `alpha-2 '${alpha2}' não virou '${alpha3}'`);
    assert.equal(deAlpha3, alpha3, `alpha-3 '${alpha3}' não sobreviveu`);
    assert.ok(ehGravavel(deAlpha2), `'${deAlpha2}' não é gravável`);
  }
});

test('os três fluxos de entrada do upload produzem código gravável ou nada', () => {
  // Reproduz a expressão de PhotoUploader.handleUpload para os três caminhos:
  //   1. fluxo do mapa    — countryCode vem do globo (alpha-3, ou GB-ENG)
  //   2. GPS              — prefilledCountryCode vem do expo-location (alpha-2)
  //   3. seletor de cidade— selectedCity.countryCode vem do Google Places (alpha-2)
  const uploadCode = (effective, cidade) =>
    toStorableCountryCode(effective) || toStorableCountryCode(cidade);

  const fluxos = [
    // [nome, effectiveCountryCode, selectedCity.countryCode, esperado]
    ['mapa: país comum', 'BRA', '', 'BRA'],
    ['mapa: nação do Reino Unido', 'GB-ENG', '', 'GB-ENG'],
    ['GPS: alpha-2', 'BR', 'BR', 'BRA'],
    ['GPS: alpha-2 minúsculo', 'br', 'br', 'BRA'],
    ['cidade: só a cidade tem país', '', 'PT', 'PRT'],
    ['cidade: alpha-3 vindo da cidade', '', 'PRT', 'PRT'],
    // Os que NÃO dão para identificar precisam virar nada — e aí a tela recusa.
    ['nada identificável', '', '', null],
    ['código inventado', 'XX', '', null],
    ['código inventado nos dois', 'XX', 'ZZ', null],
  ];

  for (const [nome, effective, cidade, esperado] of fluxos) {
    const resultado = uploadCode(effective, cidade);
    assert.equal(resultado, esperado, `fluxo "${nome}"`);
    if (resultado !== null) {
      assert.ok(ehGravavel(resultado), `fluxo "${nome}" gravaria '${resultado}', que não é código válido`);
    }
  }
});

test('os pontos de escrita usam toStorableCountryCode e recusam quando não reconhecem', () => {
  // PhotoUploader: o fallback cru saiu, e o guard existente já bloqueia o upload
  // com mensagem quando o código é nulo.
  const uploader = stripComments(read('src/components/PhotoUploader.js'));
  assert.match(uploader, /toStorableCountryCode\(effectiveCountryCode\)/);
  assert.match(uploader, /toStorableCountryCode\(selectedCity\.countryCode\)/);
  assert.doesNotMatch(
    uploader,
    /\|\|\s*selectedCity\.countryCode;/,
    'o fallback que gravava o código cru voltou'
  );
  assert.match(uploader, /if \(!uploadCountryCode \|\| !uploadCountryName\)/, 'sumiu o guard que recusa');
  assert.match(uploader, /País não identificado/, 'sumiu a mensagem de recusa');

  // visited_countries.
  const supabaseService = stripComments(read('src/services/supabase.js'));
  assert.match(supabaseService, /const normalizedCountryCode = toStorableCountryCode\(countryCode\)/);
  assert.match(supabaseService, /if \(!normalizedCountryCode\)/);
  assert.doesNotMatch(
    supabaseService,
    /getAlpha3\(countryCode\)\?\.toUpperCase\(\) \|\| countryCode\?\.toUpperCase\(\)/,
    'o fallback cru de markCountryAsVisited voltou'
  );

  // wishlist.
  const social = stripComments(read('src/services/socialService.js'));
  assert.match(social, /const normalizedCountryCode = toStorableCountryCode\(countryCode\)/);
  assert.match(social, /if \(!normalizedCountryCode\)/);
  assert.doesNotMatch(
    social,
    /const normalizeToAlpha3 =/,
    'a helper defeituosa normalizeToAlpha3 voltou'
  );
});

test('as leituras continuam compensando a mistura — nada foi quebrado', () => {
  // A correção é só do lado da ESCRITA. Os dados antigos só ficam limpos depois
  // da migração, e mesmo depois dela as variantes não atrapalham: buscar por
  // ['BRA','BR'] continua achando 'BRA'.
  const social = read('src/services/socialService.js');
  assert.match(social, /const countryCodeVariants = /, 'as variantes de leitura sumiram');

  const photo = read('src/services/photoService.js');
  assert.match(photo, /possibleCodes/, 'os possibleCodes de leitura sumiram');
});

test('a lista de nações do Reino Unido é a mesma nos dois módulos', () => {
  // A lista desceu para countryUtils (toStorableCountryCode precisa dela) e é
  // reexportada por countryStatus. Se as duas divergirem, uma nação vira código
  // inválido num lado e válido no outro.
  const status = loadEsm('src/components/map/countryStatus.js', {
    '../../utils/countryUtils': countryUtils,
    './badgeCollision': loadEsm('src/components/map/badgeCollision.js', {}),
  });

  assert.deepEqual(status.UK_NATION_CODES, UK_NATION_CODES);
  assert.deepEqual(UK_NATION_CODES, ['GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR']);
});

test('a migração converte exatamente o que o app converteria', () => {
  // A tabela de conversão do SQL foi gerada de ALPHA3_TO_ALPHA2. Se alguém editar
  // uma das duas à mão, elas divergem e o banco passa a discordar do app.
  const migration = read('supabase/migrations/20260911120000_normalize_country_codes.sql');

  const paresNoSql = [...migration.matchAll(/\('([A-Z]{2})','([A-Z]{3})'\)/g)]
    .map((m) => [m[1], m[2]]);
  assert.equal(paresNoSql.length, Object.keys(ALPHA3_TO_ALPHA2).length, 'o SQL tem outro número de pares');

  for (const [alpha2, alpha3] of paresNoSql) {
    assert.equal(
      toStorableCountryCode(alpha2),
      alpha3,
      `o SQL converte '${alpha2}' para '${alpha3}', o app converte para '${toStorableCountryCode(alpha2)}'`
    );
  }

  // E ela não pode tocar nas nações do Reino Unido nem em códigos de 3 letras.
  assert.match(migration, /where length\(t\.country_code\) = 2/);
  assert.match(migration, /GB-ENG/, 'a migração não documenta a exclusão das nações do Reino Unido');
  // As duplicatas saem antes do update, senão o índice único derruba a transação.
  assert.match(migration, /delete from public\.visited_countries as dup/);
  assert.match(migration, /delete from public\.wishlist as dup/);
});
