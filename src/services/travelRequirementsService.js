import { ALPHA3_TO_ALPHA2, getAlpha3, getCountryNamePtByCode } from '../utils/countryUtils';
import { inCountry, toCountry } from '../utils/countryPreposition';

const PORTAL_CONSULAR_URL = 'https://www.gov.br/mre/pt-br/assuntos/portal-consular';
const ANVISA_CIVP_URL = 'https://www.gov.br/anvisa/pt-br/assuntos/paf/certificado-internacional-de-vacinacao';

const MERCOSUR_ID = new Set(['ARG', 'BOL', 'CHL', 'COL', 'ECU', 'PRY', 'PER', 'URY']);
const SCHENGEN = new Set([
  'AUT', 'BEL', 'BGR', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN',
  'ISL', 'ITA', 'LVA', 'LIE', 'LTU', 'LUX', 'MLT', 'NLD', 'NOR', 'POL', 'PRT', 'ROU',
  'SVK', 'SVN', 'ESP', 'SWE', 'CHE',
]);

// Lista simplificada publicada pela ANVISA. Escalas, origem recente e regras locais
// podem alterar a exigência, por isso o app sempre mantém o link de confirmação.
const MAY_REQUIRE_YELLOW_FEVER_CIVP = new Set([
  'AFG', 'AGO', 'ATG', 'ABW', 'AUS', 'BHS', 'BHR', 'BGD', 'BRB', 'BEN', 'BOL', 'BWA',
  'BRN', 'BFA', 'BDI', 'KHM', 'CMR', 'CPV', 'CAF', 'TCD', 'CHN', 'COL', 'COG', 'COD',
  'CRI', 'CIV', 'CUB', 'DJI', 'DOM', 'ECU', 'EGY', 'SLV', 'GNQ', 'ERI', 'SWZ', 'ETH',
  'FJI', 'GAB', 'GMB', 'GHA', 'GRD', 'GLP', 'GTM', 'GIN', 'GNB', 'GUY', 'HTI', 'HND',
  'IND', 'IDN', 'IRN', 'JAM', 'KAZ', 'KEN', 'PRK', 'LBR', 'MDG', 'MWI', 'MYS', 'MDV',
  'MLI', 'MLT', 'MTQ', 'MRT', 'MEX', 'MOZ', 'MMR', 'NAM', 'NPL', 'NCL', 'NIC', 'NER',
  'NGA', 'OMN', 'PAK', 'PAN', 'PNG', 'PRY', 'PHL', 'QAT', 'RWA', 'KNA', 'VCT', 'WSM',
  'SAU', 'SEN', 'SYC', 'SLE', 'SGP', 'SLB', 'ZAF', 'LKA', 'SDN', 'STP', 'TZA', 'THA',
  'TLS', 'TGO', 'TTO', 'UGA', 'ARE', 'VUT', 'VEN', 'VNM', 'ZMB', 'ZWE',
]);

const ENTRY_RULES = {
  BRA: { text: 'Para brasileiros, a viagem é doméstica: use documento oficial com foto válido. Em voos, confirme também as regras da companhia aérea.' },
  USA: {
    text: 'Para turismo nos Estados Unidos, brasileiros precisam de passaporte válido e visto de visitante compatível, normalmente B-2 ou B1/B2.',
    url: 'https://travel.state.gov/content/travel/en/us-visas/tourism-visit.html',
    label: 'U.S. Department of State',
  },
  GBR: {
    text: 'Brasileiros em turismo no Reino Unido precisam de passaporte válido e ETA antes da viagem, salvo se já possuírem visto ou outra permissão migratória válida.',
    url: 'https://www.gov.uk/guidance/check-when-you-can-get-an-electronic-travel-authorisation-eta',
    label: 'GOV.UK — ETA',
  },
  CAN: {
    text: 'Para o Canadá, brasileiros precisam de passaporte e de visto ou eTA. A elegibilidade à eTA depende, entre outros fatores, do meio de entrada e do histórico migratório.',
    url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/entry-requirements-country.html',
    label: 'Governo do Canadá',
  },
  AUS: {
    text: 'Para turismo na Austrália, brasileiros precisam de passaporte válido e visto ou autorização eletrônica aprovada antes do embarque.',
    url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-finder/visit',
    label: 'Australian Home Affairs',
  },
  NZL: {
    text: 'Para a Nova Zelândia, viaje com passaporte válido e confirme se o seu caso exige visto ou NZeTA antes do embarque.',
    url: 'https://www.immigration.govt.nz/new-zealand-visas/visas/visa/visa-waiver',
    label: 'Immigration New Zealand',
  },
  PRY: {
    text: 'Brasileiros podem entrar no Paraguai com RG físico vigente e em bom estado ou passaporte. CNH não substitui documento de viagem.',
    url: 'https://www.gov.br/mre/pt-br/consulado-assuncao/entrada',
    label: 'Consulado do Brasil no Paraguai',
  },
};

// Textos do caso "não sei que país é este". Ficam em constantes porque os testes
// e a UI precisam reconhecê-los, e porque eles são o contrato desta correção:
// sem país identificado, o app não afirma nada sobre entrada nem sobre vacina.
export const DOCUMENTS_UNKNOWN_COUNTRY =
  'Não conseguimos identificar o país para verificar as exigências de entrada. ' +
  'Confirme documento, visto e autorizações no Portal Consular antes de viajar.';

export const HEALTH_UNKNOWN_COUNTRY =
  'Não conseguimos identificar o país para verificar exigências de vacina. ' +
  'Consulte a ANVISA antes de viajar.';

const getDocuments = (code, countryName) => {
  // Sem código não há país: nada de interpolar "o destino" numa frase que finge
  // saber do que fala.
  if (!code) return { text: DOCUMENTS_UNKNOWN_COUNTRY, curated: false };

  if (ENTRY_RULES[code]) return { ...ENTRY_RULES[code], curated: true };
  if (MERCOSUR_ID.has(code)) {
    // "para Argentina" -> "para a Argentina". Só a construção muda; o texto é o
    // mesmo. Ver utils/countryPreposition.js.
    const destination = toCountry(code, countryName) || `para ${countryName}`;
    return { text: `Em viagem de turismo ${destination}, brasileiros podem usar RG físico em bom estado e com foto identificável ou passaporte. CNH não substitui documento de viagem.`, curated: true };
  }
  if (SCHENGEN.has(code)) {
    // "em França" -> "na França"; "em Portugal" continua "em Portugal".
    const place = inCountry(code, countryName) || `em ${countryName}`;
    return {
      text: `Para turismo de curta duração ${place}, brasileiros viajam com passaporte e normalmente não precisam de visto para até 90 dias em um período de 180 dias. O ETIAS ainda não está em operação e tem início previsto para o último trimestre de 2026.`,
      url: 'https://travel-europe.europa.eu/etias/about-etias/what-is-etias_en',
      label: 'União Europeia — ETIAS',
      curated: true,
    };
  }
  // "Para entrar em Japão" era o bug de concordância: falta a contração de "em"
  // com o artigo do país. `inCountry` resolve os países que têm artigo conhecido
  // e devolve null para o resto — e para esse resto a frase é reescrita numa
  // forma que não precisa de artigo nenhum, em vez de chutar um. Ver
  // utils/countryPreposition.js.
  const place = inCountry(code, countryName);
  const opening = place
    ? `Para entrar ${place}`
    : `Para entrar neste destino (${countryName})`;

  return { text: `${opening}, leve passaporte válido e confirme se o país exige visto, autorização eletrônica, passagem de saída, seguro ou validade mínima adicional. A regra depende da nacionalidade, finalidade e duração da viagem.`, curated: false };
};

const getHealth = (code, countryName) => {
  // País que não foi identificado não recebe afirmação nenhuma sobre vacina —
  // nem positiva nem negativa. Sem código não há como cruzar com lista alguma, e
  // dizer qualquer coisa aqui seria inventar.
  if (!code) return HEALTH_UNKNOWN_COUNTRY;

  if (code === 'BRA') return 'Mantenha a vacinação de rotina atualizada e consulte alertas de saúde da região brasileira visitada.';
  if (code === 'PRY') return 'O Paraguai pode exigir CIVP de febre amarela conforme o estado brasileiro de procedência. A regra oficial inclui prazo mínimo após a vacinação; confirme antes do embarque.';
  if (MAY_REQUIRE_YELLOW_FEVER_CIVP.has(code)) {
    return `${countryName} consta na lista simplificada da ANVISA de destinos que podem exigir o CIVP de febre amarela. A exigência pode depender da origem, escalas e tempo de permanência.`;
  }

  // AUSÊNCIA DE INFORMAÇÃO, NUNCA INFORMAÇÃO DE AUSÊNCIA.
  //
  // Este texto dizia que "a lista simplificada da ANVISA não marca {país} como
  // exigência geral de CIVP de febre amarela". Era uma afirmação POSITIVA de que
  // não há exigência, feita para 131 países, produzida pelo `else` de uma lista
  // de 106 itens digitada à mão — sem fonte, sem data e sem verificação. Um
  // viajante que lesse aquilo e não se vacinasse poderia ser barrado no destino.
  //
  // O que o app realmente sabe é só isto: o país não está na nossa lista. Isso
  // não é o mesmo que "não exige", e a frase agora não confunde as duas coisas.
  const destination = toCountry(code, countryName) || `para ${countryName}`;
  return `Não temos confirmação sobre exigência de vacina de febre amarela ${destination}. Consulte a ANVISA antes de viajar e mantenha as vacinas de rotina em dia.`;
};

// Data em que a EQUIPE revisou estes textos — não a data de publicação de
// nenhuma fonte oficial, e não a data em que o app buscou nada (o app não busca:
// tudo aqui é texto estático). A UI precisa dizer isso com todas as letras: o
// rótulo antigo, "Referências revisadas em {data}", passava sensação de
// atualidade que este mecanismo não sustenta. Ver CountryRequirementsCard.
export const CONTENT_REVIEWED_AT = '10/08/2026';

/**
 * @param {string | null | undefined} countryCode
 * @returns {{
 *   countryName: string,
 *   identified: boolean,
 *   documents: string,
 *   health: string,
 *   documentsUrl: string,
 *   documentsSourceLabel: string,
 *   healthUrl: string,
 *   healthSourceLabel: string,
 *   reviewedAt: string,
 *   documentsVerified: boolean,
 *   healthVerified: boolean,
 * }}
 */
export const getFallbackTravelRequirements = countryCode => {
  // Normaliza para string ANTES de qualquer coisa: `getAlpha3` chama `.trim()` no
  // que recebe e explodia com um número. Esta função desenha uma tela sobre
  // documento e vacina — ela não pode derrubar o modal por causa do tipo do
  // argumento.
  const input = typeof countryCode === 'string' ? countryCode.trim() : '';
  const raw = (getAlpha3(input) || input).toUpperCase();

  // "Identificado" não é "veio uma string". 'ZZZ' tem forma de alpha-3 e não é
  // país nenhum: sem esta checagem ele seguia pelo caminho normal e o app
  // acabava escrevendo "não temos confirmação sobre febre amarela para ZZZ", que
  // é o mesmo defeito de fingir saber de que lugar se está falando.
  //
  // A prova de existência é o próprio mapa de países do app: só é país o que o
  // ALPHA3_TO_ALPHA2 conhece, que é o mesmo universo do globo e do passaporte.
  const identified = Boolean(raw) && Boolean(ALPHA3_TO_ALPHA2[raw]);
  const code = identified ? raw : '';
  const countryName = identified ? getCountryNamePtByCode(code, code) : '';

  const entry = getDocuments(code, countryName);

  // `healthVerified` é mais estreito que `documentsVerified` de propósito: aqui
  // ele só é true quando existe uma AFIRMAÇÃO curada (Brasil, Paraguai ou a
  // lista da ANVISA). O texto de "não temos confirmação" é justamente o caso não
  // verificado, e é ele que o indicador precisa marcar como tal.
  const healthVerified =
    identified &&
    (code === 'BRA' || code === 'PRY' || MAY_REQUIRE_YELLOW_FEVER_CIVP.has(code));

  return {
    countryName,
    identified,
    documents: entry.text,
    health: getHealth(code, countryName),
    documentsUrl: entry.url || PORTAL_CONSULAR_URL,
    documentsSourceLabel: entry.label || 'Portal Consular',
    healthUrl: ANVISA_CIVP_URL,
    healthSourceLabel: 'ANVISA — CIVP',
    reviewedAt: CONTENT_REVIEWED_AT,
    // Antes isto era um `verified` só, calculado como `Boolean(entry.url)` — ou
    // seja, true para 6 países, e nunca lido por ninguém. Agora são dois, um por
    // bloco, porque os blocos podem discordar: a França tem texto de documentos
    // curado (Schengen) e nenhuma confirmação sobre febre amarela.
    documentsVerified: Boolean(entry.curated),
    healthVerified,
  };
};
