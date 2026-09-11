// O bloco "Entrada e saúde" do modal de país.
//
// O teste central aqui é o de febre amarela. O texto antigo AFIRMAVA que "a
// lista simplificada da ANVISA não marca {país} como exigência geral de CIVP" —
// uma alegação positiva de ausência de exigência sanitária, produzida pelo
// `else` de uma lista de 106 códigos digitada à mão, servida a 131 países e até
// a códigos que o app não sabia identificar. Quem lesse aquilo e não se
// vacinasse poderia ser barrado no destino.
//
// A regra que estes testes protegem: o app pode dizer que NÃO SABE; nunca pode
// dizer que NÃO PRECISA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const readSource = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

// Igual ao helper de source-invariants: um comentário que só MENCIONA o texto
// antigo não pode reprovar a invariante que exige a ausência dele.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const countryUtils = loadEsm('src/utils/countryUtils.js', {});
const preposition = loadEsm('src/utils/countryPreposition.js', {});
const service = loadEsm('src/services/travelRequirementsService.js', {
  '../utils/countryUtils': countryUtils,
  '../utils/countryPreposition': preposition,
});

const {
  getFallbackTravelRequirements,
  DOCUMENTS_UNKNOWN_COUNTRY,
  HEALTH_UNKNOWN_COUNTRY,
} = service;

// Frases que não podem voltar de jeito nenhum.
const FORBIDDEN_ABSENCE_CLAIMS = [
  /não marca .* como exigência/i,
  /não exige .* febre amarela/i,
  /não é necessária? .* vacina/i,
];

test('nenhum país recebe afirmação de que NÃO há exigência de febre amarela', () => {
  const codes = Object.keys(countryUtils.ALPHA3_TO_ALPHA2);

  for (const code of codes) {
    const { health } = getFallbackTravelRequirements(code);
    for (const claim of FORBIDDEN_ABSENCE_CLAIMS) {
      assert.doesNotMatch(health, claim, `${code} afirma ausência de exigência: "${health}"`);
    }
  }
});

test('país fora da lista da ANVISA recebe "não temos confirmação", não "não exige"', () => {
  // Japão não está na lista simplificada e não é caso especial: é o `else`.
  const { health, healthVerified } = getFallbackTravelRequirements('JPN');

  assert.match(health, /Não temos confirmação sobre exigência de vacina de febre amarela/);
  assert.match(health, /Consulte a ANVISA antes de viajar/);
  // E o bloco se declara não verificado, que é o que acende o indicador na UI.
  assert.equal(healthVerified, false);
});

test('país na lista da ANVISA continua avisando que PODE haver exigência', () => {
  // O caminho positivo não pode ter sido enfraquecido junto: dizer "pode exigir"
  // é a informação útil, e ela vem de uma lista curada.
  const { health, healthVerified } = getFallbackTravelRequirements('AGO');

  assert.match(health, /consta na lista simplificada da ANVISA/);
  assert.match(health, /podem exigir o CIVP de febre amarela/);
  assert.equal(healthVerified, true);
});

test('código nulo, vazio ou inexistente não vira país nenhum', () => {
  // 'ZZZ' tem forma de alpha-3 e não é país: precisa cair no mesmo caminho de
  // null, e não gerar "não temos confirmação ... para ZZZ".
  for (const input of [null, undefined, '', '   ', 'ZZZ', 'XX', 42]) {
    const result = getFallbackTravelRequirements(input);

    assert.equal(result.identified, false, `${JSON.stringify(input)} passou como país`);
    assert.equal(result.documents, DOCUMENTS_UNKNOWN_COUNTRY);
    assert.equal(result.health, HEALTH_UNKNOWN_COUNTRY);
    assert.equal(result.documentsVerified, false);
    assert.equal(result.healthVerified, false);

    // E nada de "o destino", que era o texto que saía antes.
    assert.doesNotMatch(result.documents, /o destino/);
    assert.doesNotMatch(result.health, /o destino/);
    // Nem o código cru vazando para a tela.
    if (typeof input === 'string' && input.trim()) {
      assert.doesNotMatch(result.documents, new RegExp(input.trim(), 'i'));
    }
  }
});

test('a contração de "em" e "para" sai correta', () => {
  const cases = [
    ['JPN', 'no Japão', 'para o Japão'],
    ['BRA', 'no Brasil', 'para o Brasil'],
    ['USA', 'nos Estados Unidos', 'para os Estados Unidos'],
    ['FRA', 'na França', 'para a França'],
    ['ARG', 'na Argentina', 'para a Argentina'],
    ['PHL', 'nas Filipinas', 'para as Filipinas'],
    // Países sem artigo continuam com "em" simples — contrair aqui seria o erro
    // oposto ("no Portugal").
    ['PRT', 'em Portugal', 'para Portugal'],
    ['CUB', 'em Cuba', 'para Cuba'],
    ['ISR', 'em Israel', 'para Israel'],
  ];

  for (const [code, expectedIn, expectedTo] of cases) {
    const name = countryUtils.getCountryNamePtByCode(code, code);
    assert.equal(preposition.inCountry(code, name), expectedIn);
    assert.equal(preposition.toCountry(code, name), expectedTo);
  }
});

test('o texto genérico de documentos usa a contração, não "em Japão"', () => {
  const { documents } = getFallbackTravelRequirements('JPN');

  assert.match(documents, /Para entrar no Japão,/);
  assert.doesNotMatch(documents, /Para entrar em Japão/);
  assert.doesNotMatch(documents, /em o /);
});

test('artigo desconhecido nunca vira palpite', () => {
  // A regra de ouro do módulo: sem entrada na tabela, devolve null e quem chama
  // troca a frase. Um artigo errado ("na Canadá") é pior que uma frase seca.
  assert.equal(preposition.inCountry('ZZZ', 'Zzz'), null);
  assert.equal(preposition.toCountry('ZZZ', 'Zzz'), null);
  assert.equal(preposition.inCountry(null, 'Zzz'), null);

  // E todo país que o app conhece TEM entrada, então na prática ninguém cai na
  // frase neutra hoje.
  const semArtigo = Object.keys(countryUtils.ALPHA3_TO_ALPHA2)
    .filter(code => preposition.COUNTRY_ARTICLE[code] === undefined);
  assert.deepEqual(semArtigo, [], 'países do app sem artigo definido');
});

test('o indicador separa informação curada de informação genérica', () => {
  // Texto próprio revisado.
  assert.equal(getFallbackTravelRequirements('USA').documentsVerified, true);
  // Grupo curado (Schengen e Mercosul contam como revisados).
  assert.equal(getFallbackTravelRequirements('FRA').documentsVerified, true);
  assert.equal(getFallbackTravelRequirements('ARG').documentsVerified, true);
  // Parágrafo genérico.
  assert.equal(getFallbackTravelRequirements('JPN').documentsVerified, false);
  assert.equal(getFallbackTravelRequirements('THA').documentsVerified, false);

  // Os dois blocos são independentes: a França tem documentos curados (Schengen)
  // e nenhuma confirmação sobre febre amarela. Um indicador só não daria conta.
  const franca = getFallbackTravelRequirements('FRA');
  assert.equal(franca.documentsVerified, true);
  assert.equal(franca.healthVerified, false);
});

test('a data exposta é a da revisão do texto pela equipe', () => {
  const { reviewedAt } = getFallbackTravelRequirements('BRA');
  assert.equal(reviewedAt, service.CONTENT_REVIEWED_AT);

  // O card precisa dizer de quem é a data. "Referências revisadas em {data}"
  // sugeria que as FONTES tinham sido conferidas ali, e a data é estática.
  const card = readSource('src/components/CountryRequirementsCard.js');
  assert.match(card, /Texto revisado pela equipe em \{requirements\.reviewedAt\}/);
  assert.match(card, /Confirme sempre na fonte acima/);
  // Sem comentários: o comentário que explica a mudança CITA o rótulo antigo, e
  // sem isto ele próprio reprovaria a asserção.
  assert.doesNotMatch(stripComments(card), /Referências revisadas em/);
});

test('o card mostra o indicador nos dois blocos', () => {
  const card = readSource('src/components/CountryRequirementsCard.js');

  assert.match(card, /Informação específica revisada/);
  assert.match(card, /Informação geral — confirme na fonte oficial/);
  // Um por bloco: documentos e vacina podem discordar.
  assert.match(card, /<SourceBadge verified=\{requirements\.documentsVerified\}/);
  assert.match(card, /<SourceBadge verified=\{requirements\.healthVerified\}/);
});

test('Schengen e Mercosul também contraem a preposição', () => {
  // Mesmo texto de antes; só a construção gramatical mudou. Saía "em França" e
  // "para Argentina".
  const schengen = [
    ['FRA', 'curta duração na França,'],
    ['DEU', 'curta duração na Alemanha,'],
    ['ITA', 'curta duração na Itália,'],
    ['NLD', 'curta duração nos Países Baixos,'],
    // Portugal não leva artigo: contrair aqui seria o erro oposto.
    ['PRT', 'curta duração em Portugal,'],
  ];
  for (const [code, expected] of schengen) {
    const { documents } = getFallbackTravelRequirements(code);
    assert.ok(documents.includes(expected), `${code}: esperava "${expected}" em "${documents}"`);
    // O conteúdo em volta continua o mesmo.
    assert.match(documents, /90 dias em um período de 180 dias/);
  }

  const mercosul = [
    ['ARG', 'Em viagem de turismo para a Argentina,'],
    ['PER', 'Em viagem de turismo para o Peru,'],
    ['URY', 'Em viagem de turismo para o Uruguai,'],
    ['BOL', 'Em viagem de turismo para a Bolívia,'],
  ];
  for (const [code, expected] of mercosul) {
    const { documents } = getFallbackTravelRequirements(code);
    assert.ok(documents.startsWith(expected), `${code}: esperava começar com "${expected}"`);
    assert.match(documents, /CNH não substitui documento de viagem/);
  }
});

test('nenhum texto do serviço sai com a preposição solta antes do país', () => {
  // Varredura: "em França", "para Argentina" e afins não podem existir em
  // nenhum dos 250 países, em nenhum dos dois blocos.
  const codes = Object.keys(countryUtils.ALPHA3_TO_ALPHA2);

  for (const code of codes) {
    const { documents, health } = getFallbackTravelRequirements(code);
    const name = countryUtils.getCountryNamePtByCode(code, code);
    const article = preposition.COUNTRY_ARTICLE[code];

    // Só checa quem TEM artigo: para esses, "em <Nome>" ou "para <Nome>" cru é
    // justamente o defeito.
    if (!article) continue;

    for (const text of [documents, health]) {
      assert.ok(
        !text.includes(`em ${name}`),
        `${code}: "em ${name}" sem contração em "${text}"`
      );
      assert.ok(
        !text.includes(`para ${name}`),
        `${code}: "para ${name}" sem artigo em "${text}"`
      );
    }
  }
});

test('a migração cria a coluna bio e trava o limite no banco', () => {
  // O limite de 160 vivia só no app: qualquer caminho que não passasse pela tela
  // podia gravar uma bio de qualquer tamanho.
  const migration = readSource('supabase/migrations/20260910120000_profiles_bio.sql');

  // Cria a coluna, e não só o constraint: ela nunca existiu (ver o cabeçalho da
  // própria migração).
  assert.match(migration, /add column if not exists bio text/);
  assert.match(migration, /check \(bio is null or char_length\(bio\) <= 160\)/);
  // Idempotente: precisa poder rodar de novo sem quebrar.
  assert.match(migration, /drop constraint if exists profiles_bio_length_check/);
  // E o PostgREST precisa recarregar o schema, senão a coluna existe no banco e
  // o cache continua respondendo PGRST204.
  assert.match(migration, /notify pgrst, 'reload schema'/);

  // O número do banco tem de ser o mesmo do app.
  const bio = loadEsm('src/utils/bio.js', {});
  assert.equal(bio.BIO_MAX_LENGTH, 160);
});
