import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getCountryNamePtByCode } from '../utils/countryUtils';

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
    return {
      name: 'Informações não disponíveis',
      officialName: '',
      capital: 'N/A',
      population: 0,
      languages: [],
      currencies: [],
      region: 'N/A',
      subregion: 'N/A',
      borders: [],
      timezones: [],
      phoneCode: 'N/A',
      coordinates: [],
      area: 0,
      googleMaps: '',
    };
  }

  const processedData = {
    name: getCountryNamePtByCode(code, data.name),
    officialName: getCountryNamePtByCode(code, data.name),
    capital: data.capital,
    population: data.population,
    languages: data.languages,
    currencies: data.currencies,
    region: data.region,
    subregion: data.subregion,
    borders: [],
    timezones: [],
    phoneCode: data.phoneCode,
    coordinates: [],
    area: data.area,
    googleMaps: '',
  };

  countryCache.set(code, processedData);
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
}

/**
 * Busca países por região usando dataset local
 */
export async function getCountriesByRegion(region) {
  return Object.entries(COUNTRIES_STATIC)
    .filter(([, d]) => d.region === region)
    .map(([code, d]) => {
      return {
        name: getCountryNamePtByCode(code, d.name),
        code,
        capital: d.capital,
        population: d.population,
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
      return {
        name: getCountryNamePtByCode(code, d.name),
        code: code.toUpperCase(),
      };
    })
    .filter(Boolean);
}
