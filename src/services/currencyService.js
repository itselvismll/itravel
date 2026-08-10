import { fetch } from 'expo/fetch';
import { COUNTRIES_STATIC } from '../data/countriesStaticData';

const CACHE_KEY = 'journi.dailyExchangeRates';
const COUNTRY_CURRENCY_CACHE_KEY = 'journi.countryCurrencies';
let memoryCache = {};
let countryCurrencyMemoryCache = {};

// Fonte local usada antes da rede. Além de deixar o formulário instantâneo,
// evita que uma indisponibilidade do Rest Countries bloqueie o orçamento.
const CURRENCY_NAME_TO_CODE = {
  'Argentine peso': 'ARS',
  'Australian dollar': 'AUD',
  'Brazilian real': 'BRL',
  'British pound': 'GBP',
  'Bulgarian lev': 'BGN',
  'Canadian dollar': 'CAD',
  'Chinese yuan': 'CNY',
  'Czech koruna': 'CZK',
  'Danish krone': 'DKK',
  Euro: 'EUR',
  'Hong Kong dollar': 'HKD',
  'Hungarian forint': 'HUF',
  'Icelandic króna': 'ISK',
  'Indian rupee': 'INR',
  'Indonesian rupiah': 'IDR',
  'Israeli new shekel': 'ILS',
  'Japanese yen': 'JPY',
  'Malaysian ringgit': 'MYR',
  'Mexican peso': 'MXN',
  'New Taiwan dollar': 'TWD',
  'New Zealand dollar': 'NZD',
  'Norwegian krone': 'NOK',
  'Philippine peso': 'PHP',
  'Polish złoty': 'PLN',
  'Romanian leu': 'RON',
  'Singapore dollar': 'SGD',
  'South African rand': 'ZAR',
  'South Korean won': 'KRW',
  'Swedish krona': 'SEK',
  'Swiss franc': 'CHF',
  'Thai baht': 'THB',
  'Turkish lira': 'TRY',
  'UAE dirham': 'AED',
  'United States dollar': 'USD',
};

const todayKey = () => new Date().toISOString().slice(0, 10);

const readCache = () => {
  if (typeof globalThis.localStorage === 'undefined') return memoryCache;
  try {
    return JSON.parse(globalThis.localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeCache = (cache) => {
  memoryCache = cache;
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
};

export const getDailyExchangeRate = async (from, to) => {
  if (!from || !to) return { success: false, error: 'Selecione as duas moedas.' };
  if (from === to) return { success: true, rate: 1, date: todayKey(), source: 'Conversão direta' };

  const cacheId = `${todayKey()}:${from}:${to}`;
  const cached = readCache()[cacheId];
  if (cached) return { success: true, ...cached, cached: true };

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rate = Number(data?.rate);
    if (!Number.isFinite(rate)) throw new Error('Cotação indisponível');

    const result = { rate, date: data.date || todayKey(), source: 'Frankfurter' };
    writeCache({ ...readCache(), [cacheId]: result });
    return { success: true, ...result };
  } catch {
    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rate = Number(data?.rates?.[to]);
      if (data?.result !== 'success' || !Number.isFinite(rate)) throw new Error('Cotação indisponível');

      const result = {
        rate,
        date: data.time_last_update_unix
          ? new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
          : todayKey(),
        source: 'ExchangeRate-API',
      };
      writeCache({ ...readCache(), [cacheId]: result });
      return { success: true, ...result };
    } catch {
      return { success: false, error: 'Cotação indisponível agora. O roteiro pode ser criado sem conversão.' };
    }
  }
};

export const convertCurrency = (value, rate) => (Number(value) || 0) * (Number(rate) || 0);

export const formatExchangeRate = (rate, currency) => {
  if (!Number.isFinite(Number(rate))) return '';
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(Number(rate));
  } catch {
    return `${currency} ${Number(rate).toFixed(4)}`;
  }
};

const readCountryCurrencyCache = () => {
  if (typeof globalThis.localStorage === 'undefined') return countryCurrencyMemoryCache;
  try {
    return JSON.parse(globalThis.localStorage.getItem(COUNTRY_CURRENCY_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeCountryCurrencyCache = cache => {
  countryCurrencyMemoryCache = cache;
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(COUNTRY_CURRENCY_CACHE_KEY, JSON.stringify(cache));
  }
};

export const getCountryCurrency = async countryCode => {
  const normalizedCode = String(countryCode || '').toUpperCase();
  if (!normalizedCode) return { success: false, error: 'País inválido.' };

  const cached = readCountryCurrencyCache()[normalizedCode];
  if (cached) return { success: true, ...cached, cached: true };

  const localCurrency = COUNTRIES_STATIC[normalizedCode]?.currencies?.[0];
  const localCurrencyCode = CURRENCY_NAME_TO_CODE[localCurrency?.name];
  if (localCurrencyCode) {
    const result = {
      code: localCurrencyCode,
      name: localCurrency.name,
      symbol: localCurrency.symbol || localCurrencyCode,
    };
    writeCountryCurrencyCache({ ...readCountryCurrencyCache(), [normalizedCode]: result });
    return { success: true, ...result, source: 'Base local' };
  }

  try {
    const response = await fetch(
      `https://restcountries.com/v3.1/alpha/${encodeURIComponent(normalizedCode)}?fields=currencies`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const country = Array.isArray(data) ? data[0] : data;
    const [code, details] = Object.entries(country?.currencies || {})[0] || [];
    if (!code) throw new Error('Moeda não encontrada');

    const result = {
      code,
      name: details?.name || code,
      symbol: details?.symbol || code,
    };
    writeCountryCurrencyCache({ ...readCountryCurrencyCache(), [normalizedCode]: result });
    return { success: true, ...result };
  } catch {
    return { success: false, error: 'Não foi possível identificar a moeda deste destino.' };
  }
};

export const parseMoneyInput = (value) => Number(String(value || '').replace(/\D/g, '')) || 0;

export const formatMoneyInput = (value) => {
  const number = parseMoneyInput(value);
  return number ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(number) : '';
};

