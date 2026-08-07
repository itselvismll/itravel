// Busca com autocomplete compartilhada pelas telas de Mapa, Postar foto e Explorar.
//
// A tela do mapa sempre funcionou bem porque normaliza acentos e casa por prefixo de
// palavra. Este módulo extrai essa lógica para que Explorar use exatamente a mesma
// regra, e aplica a mesma abordagem (normalização + apelidos em PT) à busca remota de
// cidades usada pelo PhotoUploader.

import { getCountryNamePtByCode } from './countryUtils';

const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');

export const normalizeSearchText = (value) =>
  (value || '')
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .trim();

// Debounce curto para busca local (sem rede) e mais folgado para a API de cidades.
export const COUNTRY_SEARCH_DEBOUNCE_MS = 120;
export const CITY_SEARCH_DEBOUNCE_MS = 250;

export const MIN_COUNTRY_QUERY_LENGTH = 1;
export const MIN_CITY_QUERY_LENGTH = 2;

export const MAX_SEARCH_RESULTS = 8;

/**
 * Casa a busca contra qualquer palavra do nome, ignorando acentos.
 * "york" encontra "Nova York"; "franca" encontra "França".
 */
export const matchesSearchQuery = (name, normalizedQuery) => {
  if (!normalizedQuery) return false;
  const normalizedName = normalizeSearchText(name);
  if (normalizedName.startsWith(normalizedQuery)) return true;
  return normalizedName.split(/\s+/).some((word) => word.startsWith(normalizedQuery));
};

/**
 * Busca local de países. `entries` são objetos com pelo menos { name }, e opcionalmente
 * { nameEn }. Retorna as entradas originais, ordenadas por nome.
 */
export const searchCountries = (entries, rawQuery, limit = MAX_SEARCH_RESULTS) => {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (normalizedQuery.length < MIN_COUNTRY_QUERY_LENGTH) return [];

  return (entries || [])
    .filter((entry) =>
      matchesSearchQuery(entry?.name, normalizedQuery) ||
      matchesSearchQuery(entry?.nameEn, normalizedQuery))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
    .slice(0, limit);
};

// ─── Busca de cidades (Photon) ───────────────────────────────────────────────
//
// A Photon indexa `name`, `name:en`, `name:de` e `name:fr` — não há `name:pt`. Por isso
// exônimos portugueses ("Tóquio", "Nova York", "Pequim") não encontram nada. A tabela
// abaixo reescreve a consulta para o nome que a API realmente conhece.
const CITY_QUERY_ALIASES = {
  // Ásia
  'toquio': 'Tokyo', 'quioto': 'Kyoto', 'osaca': 'Osaka', 'nagasaqui': 'Nagasaki',
  'pequim': 'Beijing', 'xangai': 'Shanghai', 'cantao': 'Guangzhou', 'nanquim': 'Nanjing',
  'seul': 'Seoul', 'taipe': 'Taipei', 'nova delhi': 'New Delhi', 'deli': 'Delhi',
  'bombaim': 'Mumbai', 'calcuta': 'Kolkata', 'madras': 'Chennai',
  'bangcoc': 'Bangkok', 'bangcoque': 'Bangkok', 'cingapura': 'Singapore',
  'singapura': 'Singapore', 'jacarta': 'Jakarta', 'hanoi': 'Hanoi',
  'saigao': 'Ho Chi Minh City', 'manila': 'Manila', 'katmandu': 'Kathmandu',
  'colombo': 'Colombo', 'rangum': 'Yangon',
  // Oriente Médio
  'jerusalem': 'Jerusalem', 'teera': 'Tehran', 'teerao': 'Tehran', 'bagda': 'Baghdad',
  'damasco': 'Damascus', 'beirute': 'Beirut', 'ama': 'Amman', 'riade': 'Riyadh',
  'meca': 'Mecca', 'medina': 'Medina', 'doha': 'Doha', 'dubai': 'Dubai',
  'abu dabi': 'Abu Dhabi', 'istambul': 'Istanbul', 'ancara': 'Ankara', 'esmirna': 'Izmir',
  // Europa
  'londres': 'London', 'edimburgo': 'Edinburgh', 'dublim': 'Dublin',
  'moscou': 'Moscow', 'moscovo': 'Moscow', 'sao petersburgo': 'Saint Petersburg',
  'kiev': 'Kyiv', 'varsovia': 'Warsaw', 'cracovia': 'Krakow', 'praga': 'Prague',
  'viena': 'Vienna', 'salzburgo': 'Salzburg', 'munique': 'Munich', 'berlim': 'Berlin',
  'colonia': 'Cologne', 'hamburgo': 'Hamburg', 'nuremberga': 'Nuremberg',
  'bruxelas': 'Brussels', 'antuerpia': 'Antwerp', 'bruges': 'Bruges',
  'haia': 'The Hague', 'a haia': 'The Hague', 'amsterda': 'Amsterdam',
  'amsterdao': 'Amsterdam', 'roterda': 'Rotterdam',
  'copenhague': 'Copenhagen', 'estocolmo': 'Stockholm', 'helsinque': 'Helsinki',
  'helsinquia': 'Helsinki', 'gotemburgo': 'Gothenburg',
  'marselha': 'Marseille', 'estrasburgo': 'Strasbourg', 'bordeus': 'Bordeaux',
  'genebra': 'Geneva', 'zurique': 'Zurich', 'berna': 'Bern', 'basileia': 'Basel',
  'roma': 'Rome', 'veneza': 'Venice', 'florenca': 'Florence', 'napoles': 'Naples',
  'turim': 'Turin', 'genova': 'Genoa', 'bolonha': 'Bologna', 'milao': 'Milan',
  'madri': 'Madrid', 'sevilha': 'Seville', 'saragoca': 'Zaragoza', 'cordova': 'Cordoba',
  'maiorca': 'Palma', 'palma de maiorca': 'Palma',
  'atenas': 'Athens', 'salonica': 'Thessaloniki', 'tessalonica': 'Thessaloniki',
  'belgrado': 'Belgrade', 'bucareste': 'Bucharest', 'budapeste': 'Budapest',
  'sofia': 'Sofia', 'zagrebe': 'Zagreb', 'liubliana': 'Ljubljana',
  // África
  'cidade do cabo': 'Cape Town', 'joanesburgo': 'Johannesburg', 'nairobi': 'Nairobi',
  'adis abeba': 'Addis Ababa', 'argel': 'Algiers', 'tunis': 'Tunis',
  'tripoli': 'Tripoli', 'marraquexe': 'Marrakesh', 'marrakech': 'Marrakesh',
  'acra': 'Accra', 'dacar': 'Dakar', 'cairo': 'Cairo', 'o cairo': 'Cairo',
  // Américas
  'nova york': 'New York', 'nova iorque': 'New York', 'nova orleans': 'New Orleans',
  'filadelfia': 'Philadelphia', 'sao francisco': 'San Francisco',
  'cidade do mexico': 'Mexico City', 'cidade do panama': 'Panama City',
  'havana': 'Havana', 'montevideu': 'Montevideo', 'assuncao': 'Asuncion',
  // Oceania
  'sidney': 'Sydney', 'camberra': 'Canberra',
};

const CITY_ALIAS_KEYS = Object.keys(CITY_QUERY_ALIASES);
const MIN_ALIAS_PREFIX_LENGTH = 4;

/**
 * Resolve a consulta digitada para o termo que a Photon entende.
 * Casa exatamente ("tóquio") ou por prefixo não-ambíguo ("toqui").
 */
export const resolveCityQuery = (rawQuery) => {
  const normalized = normalizeSearchText(rawQuery);
  if (!normalized) return '';

  const exact = CITY_QUERY_ALIASES[normalized];
  if (exact) return exact;

  if (normalized.length >= MIN_ALIAS_PREFIX_LENGTH) {
    const prefixMatches = CITY_ALIAS_KEYS.filter((key) => key.startsWith(normalized));
    // Só reescreve quando não há ambiguidade — "sao" casaria com vários apelidos.
    if (prefixMatches.length === 1) return CITY_QUERY_ALIASES[prefixMatches[0]];
  }

  return String(rawQuery).trim();
};

const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';
// `lang=pt` NÃO é suportado pela Photon (retorna HTTP 400 e derruba a busca inteira).
// Os idiomas aceitos são: default, de, en, fr. `en` é o único que devolve nomes em
// alfabeto latino para o mundo todo (com `default`, Tóquio volta como 東京都).
const PHOTON_LANG = 'en';
// `layer=city` é o filtro semântico da Photon: cobre cidade/vila/município em qualquer
// país. Filtrar por `osm_tag=place:*` parece equivalente mas exclui casos importantes —
// Tóquio é `place:province` no OSM e sumia da lista.
const PHOTON_LAYER = 'city';

const PLACE_TIER = {
  city: 0,
  municipality: 1,
  town: 1,
  province: 1,
  borough: 2,
  village: 3,
};

const buildPhotonUrl = (query, limit) =>
  `${PHOTON_ENDPOINT}?q=${encodeURIComponent(query)}&limit=${limit}` +
  `&lang=${PHOTON_LANG}&layer=${PHOTON_LAYER}`;

const toCitySuggestion = (feature) => {
  const props = feature?.properties || {};
  const shortName = props.name;
  if (!shortName) return null;

  const countryCode = props.countrycode ? props.countrycode.toUpperCase() : '';
  const country = getCountryNamePtByCode(countryCode, props.country || '');
  const coords = feature?.geometry?.coordinates || [];

  return {
    name: `${shortName}, ${country}`,
    shortName,
    state: props.state || '',
    country,
    countryCode,
    placeType: props.osm_value || '',
    lat: Number.isFinite(coords[1]) ? coords[1] : null,
    lng: Number.isFinite(coords[0]) ? coords[0] : null,
  };
};

/**
 * Rótulo exibido na lista. Inclui o estado porque "Paris, Estados Unidos" aparece cinco
 * vezes — sem ele as sugestões ficam indistinguíveis.
 */
export const formatCityLabel = (city) =>
  [city?.shortName, city?.state, city?.country].filter(Boolean).join(', ');

const rankCities = (suggestions, normalizedQuery) =>
  suggestions
    .map((city, index) => {
      const normalizedName = normalizeSearchText(city.shortName);
      let nameScore = 2;
      if (normalizedName === normalizedQuery) nameScore = 0;
      else if (normalizedName.startsWith(normalizedQuery)) nameScore = 1;
      const tier = PLACE_TIER[city.placeType] ?? 4;
      return { city, index, nameScore, tier };
    })
    .sort((a, b) =>
      a.nameScore - b.nameScore ||
      a.tier - b.tier ||
      a.index - b.index)
    .map(({ city }) => city);

const RETRY_DELAY_MS = 400;

const abortError = () => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

const delay = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });

// A instância pública da Photon devolve 503 sob rajada. Uma única retentativa curta
// resolve o caso comum sem transformar falha de rede em "nenhuma cidade encontrada".
const fetchCities = async (query, { signal, limit, retry = true }) => {
  const response = await fetch(buildPhotonUrl(query, limit), { signal });

  if (!response.ok) {
    if (retry && response.status >= 500) {
      await delay(RETRY_DELAY_MS, signal);
      return fetchCities(query, { signal, limit, retry: false });
    }
    throw new Error(`Busca de cidades indisponível (${response.status})`);
  }

  const data = await response.json();
  return (data.features || []).map(toCitySuggestion).filter(Boolean);
};

/**
 * Busca cidades no mundo todo, opcionalmente restrita a um país (alpha-2).
 *
 * @param {string} rawQuery texto digitado pelo usuário
 * @param {object} options
 * @param {string} [options.countryAlpha2] restringe os resultados a este país
 * @param {string} [options.countryNameEn] usado no fallback quando o filtro por país zera
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.limit]
 * @returns {Promise<Array>} sugestões já ordenadas e sem duplicatas
 */
export const searchCities = async (rawQuery, options = {}) => {
  const {
    countryAlpha2 = '',
    countryNameEn = '',
    signal,
    limit = MAX_SEARCH_RESULTS,
  } = options;

  const trimmed = String(rawQuery || '').trim();
  if (trimmed.length < MIN_CITY_QUERY_LENGTH) return [];

  const resolvedQuery = resolveCityQuery(trimmed);
  const normalizedQuery = normalizeSearchText(resolvedQuery);
  const targetCountry = countryAlpha2 ? countryAlpha2.toUpperCase() : '';
  // Sem filtro de país a lista já vem enxuta; com filtro, buscamos mais para sobrar
  // resultado depois de descartar os outros países.
  const fetchLimit = targetCountry ? 30 : 20;

  let results = await fetchCities(resolvedQuery, { signal, limit: fetchLimit });

  if (targetCountry) {
    const inCountry = results.filter((city) => city.countryCode === targetCountry);
    // A Photon não filtra por país; se o país buscado não coube no top-N, refazemos a
    // consulta com o nome do país junto, que é o que a API consegue desambiguar.
    if (inCountry.length === 0 && countryNameEn) {
      const fallback = await fetchCities(`${resolvedQuery}, ${countryNameEn}`, {
        signal,
        limit: fetchLimit,
      });
      results = fallback.filter((city) => city.countryCode === targetCountry);
    } else {
      results = inCountry;
    }
  }

  const seen = new Set();
  const unique = results.filter((city) => {
    const key = normalizeSearchText(`${city.shortName}|${city.state}|${city.countryCode}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return rankCities(unique, normalizedQuery).slice(0, limit);
};
