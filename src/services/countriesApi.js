import { logger } from '../utils/logger';
import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getAlpha2 } from '../utils/countryUtils';

// Cache em memória (mantido para compatibilidade com código existente)
const countryCache = new Map();

/**
 * Busca informações detalhadas de um país pelo código ISO3.
 * Usa dataset local para evitar dependência de APIs externas com CORS bloqueado.
 */
export async function getCountryInfo(countryCode) {
  if (!countryCode) return null;

  const code = countryCode.toUpperCase();

  if (countryCache.has(code)) {
    return countryCache.get(code);
  }

  const data = COUNTRIES_STATIC[code];

  if (!data) {
    logger.log(`⚠️ País não encontrado no dataset local: ${code}`);
    return {
      name: 'Informações não disponíveis',
      officialName: '',
      capital: 'N/A',
      population: 0,
      languages: [],
      currencies: [],
      region: 'N/A',
      subregion: 'N/A',
      flag: '',
      borders: [],
      timezones: [],
      phoneCode: 'N/A',
      coordinates: [],
      area: 0,
      googleMaps: '',
    };
  }

  const alpha2 = getAlpha2(code);
  const processedData = {
    name: data.name,
    officialName: data.name,
    capital: data.capital,
    population: data.population,
    languages: data.languages,
    currencies: data.currencies,
    region: data.region,
    subregion: data.subregion,
    flag: alpha2 ? `https://flagcdn.com/${alpha2}.svg` : '',
    borders: [],
    timezones: [],
    phoneCode: data.phoneCode,
    coordinates: [],
    area: data.area,
    googleMaps: '',
  };

  countryCache.set(code, processedData);
  logger.log(`✅ Dados de ${code} carregados do dataset local`);
  return processedData;
}

/**
 * Formata número de população
 */
export function formatPopulation(population) {
  if (!population) return 'Não disponível';

  if (population >= 1000000000) {
    return `${(population / 1000000000).toFixed(2)} bilhões`;
  }
  if (population >= 1000000) {
    return `${(population / 1000000).toFixed(2)} milhões`;
  }
  if (population >= 1000) {
    return `${(population / 1000).toFixed(0)} mil`;
  }
  return population.toLocaleString('pt-BR');
}

/**
 * Formata área territorial
 */
export function formatArea(area) {
  if (!area) return 'Não disponível';
  return `${area.toLocaleString('pt-BR')} km²`;
}

/**
 * Busca múltiplos países de uma vez
 */
export async function getMultipleCountries(countryCodes) {
  const promises = countryCodes.map(code => getCountryInfo(code));
  return Promise.all(promises);
}

/**
 * Limpa o cache (útil para forçar atualização)
 */
export function clearCountryCache() {
  countryCache.clear();
  logger.log('🧹 Cache de países limpo');
}

/**
 * Busca países por região usando dataset local
 */
export async function getCountriesByRegion(region) {
  return Object.entries(COUNTRIES_STATIC)
    .filter(([, d]) => d.region === region)
    .map(([code, d]) => {
      const a2 = getAlpha2(code);
      return {
        name: d.name,
        code,
        capital: d.capital,
        population: d.population,
        flag: a2 ? `https://flagcdn.com/${a2}.svg` : '',
      };
    });
}

/**
 * Busca países vizinhos (fronteiras) usando dataset local
 */
export async function getBorderCountries(borderCodes) {
  if (!borderCodes || borderCodes.length === 0) return [];

  return borderCodes
    .map(code => {
      const d = COUNTRIES_STATIC[code.toUpperCase()];
      if (!d) return null;
      const a2 = getAlpha2(code);
      return {
        name: d.name,
        code: code.toUpperCase(),
        flag: a2 ? `https://flagcdn.com/${a2}.svg` : '',
      };
    })
    .filter(Boolean);
}
