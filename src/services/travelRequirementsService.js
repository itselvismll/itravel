import { getAlpha3, getCountryNamePtByCode } from '../utils/countryUtils';

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

const getDocuments = (code, countryName) => {
  if (ENTRY_RULES[code]) return ENTRY_RULES[code];
  if (MERCOSUR_ID.has(code)) {
    return { text: `Em viagem de turismo para ${countryName}, brasileiros podem usar RG físico em bom estado e com foto identificável ou passaporte. CNH não substitui documento de viagem.` };
  }
  if (SCHENGEN.has(code)) {
    return {
      text: `Para turismo de curta duração em ${countryName}, brasileiros viajam com passaporte e normalmente não precisam de visto para até 90 dias em um período de 180 dias. O ETIAS ainda não está em operação e tem início previsto para o último trimestre de 2026.`,
      url: 'https://travel-europe.europa.eu/etias/about-etias/what-is-etias_en',
      label: 'União Europeia — ETIAS',
    };
  }
  return { text: `Para entrar em ${countryName}, leve passaporte válido e confirme se o país exige visto, autorização eletrônica, passagem de saída, seguro ou validade mínima adicional. A regra depende da nacionalidade, finalidade e duração da viagem.` };
};

const getHealth = (code, countryName) => {
  if (code === 'BRA') return 'Mantenha a vacinação de rotina atualizada e consulte alertas de saúde da região brasileira visitada.';
  if (code === 'PRY') return 'O Paraguai pode exigir CIVP de febre amarela conforme o estado brasileiro de procedência. A regra oficial inclui prazo mínimo após a vacinação; confirme antes do embarque.';
  if (MAY_REQUIRE_YELLOW_FEVER_CIVP.has(code)) {
    return `${countryName} consta na lista simplificada da ANVISA de destinos que podem exigir o CIVP de febre amarela. A exigência pode depender da origem, escalas e tempo de permanência.`;
  }
  return `A lista simplificada da ANVISA não marca ${countryName} como exigência geral de CIVP de febre amarela para este cenário. Ainda assim, escalas e mudanças sanitárias podem alterar a regra; mantenha vacinas de rotina atualizadas.`;
};

export const getFallbackTravelRequirements = countryCode => {
  const code = getAlpha3(countryCode)?.toUpperCase() || String(countryCode || '').toUpperCase();
  const countryName = getCountryNamePtByCode(code, code || 'o destino');
  const entry = getDocuments(code, countryName);

  return {
    countryName,
    documents: entry.text,
    health: getHealth(code, countryName),
    documentsUrl: entry.url || PORTAL_CONSULAR_URL,
    documentsSourceLabel: entry.label || 'Portal Consular',
    healthUrl: ANVISA_CIVP_URL,
    healthSourceLabel: 'ANVISA — CIVP',
    updatedAt: '10/08/2026',
    verified: Boolean(entry.url),
  };
};
