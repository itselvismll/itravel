import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getCountryName } from '../utils/countryUtils';
import { DEFAULT_LOCALE_TAG } from '../utils/constants';

// Cache em memória (mantido para compatibilidade com código existente).
// A CHAVE leva o `tag`: o nome dentro de `processedData` depende do idioma, e uma
// chave só por código devolveria o nome do primeiro idioma que pediu aquele país
// para todo idioma depois, inclusive depois de uma troca de idioma em runtime.
const countryCache = new Map();

/**
 * Busca informações detalhadas de um país pelo código ISO3.
 * Usa dataset local para evitar dependência de APIs externas com CORS bloqueado.
 *
 * @param {string} countryCode
 * @param {string} [tag] tag BCP 47 do idioma ativo ('pt-BR' | 'en-US' | 'es-ES')
 */
export async function getCountryInfo(countryCode, tag = DEFAULT_LOCALE_TAG) {
  if (!countryCode) return null;

  const code = countryCode.toUpperCase();
  const cacheKey = `${code}:${tag}`;

  if (countryCache.has(cacheKey)) {
    return countryCache.get(cacheKey);
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
    name: getCountryName(code, data.name, tag),
    officialName: getCountryName(code, data.name, tag),
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

  countryCache.set(cacheKey, processedData);
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
export async function getMultipleCountries(countryCodes, tag = DEFAULT_LOCALE_TAG) {
  const promises = countryCodes.map(code => getCountryInfo(code, tag));
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
export async function getCountriesByRegion(region, tag = DEFAULT_LOCALE_TAG) {
  return Object.entries(COUNTRIES_STATIC)
    .filter(([, d]) => d.region === region)
    .map(([code, d]) => {
      return {
        name: getCountryName(code, d.name, tag),
        code,
        capital: d.capital,
        population: d.population,
      };
    });
}

/**
 * Busca países vizinhos (fronteiras) usando dataset local
 */
export async function getBorderCountries(borderCodes, tag = DEFAULT_LOCALE_TAG) {
  if (!borderCodes || borderCodes.length === 0) return [];

  return borderCodes
    .map(code => {
      const d = COUNTRIES_STATIC[code.toUpperCase()];
      if (!d) return null;
      return {
        name: getCountryName(code, d.name, tag),
        code: code.toUpperCase(),
      };
    })
    .filter(Boolean);
}
