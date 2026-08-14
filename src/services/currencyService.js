import { fetch } from 'expo/fetch';
import { COUNTRIES_STATIC } from '../data/countriesStaticData';

const CACHE_KEY = 'journi.dailyExchangeRates';
const COUNTRY_CURRENCY_CACHE_KEY = 'journi.countryCurrencies';
let memoryCache = {};
let countryCurrencyMemoryCache = {};
let countryCurrenciesRequest = null;

// Territórios cuja moeda local tem paridade legal 1:1 com outra moeda usam a
// cotação da moeda de reserva quando os provedores não publicam uma série própria.
const RATE_PROXY_CODES = Object.freeze({ CKD: 'NZD' });

// O catálogo internacional ainda lista o antigo conjunto multimoeda do Zimbábue.
// A moeda nacional vigente é o Zimbabwe Gold (ZiG), código ZWG.
const COUNTRY_CURRENCY_OVERRIDES = Object.freeze({
  ZWE: { code: 'ZWG', name: 'Zimbabwe Gold', symbol: 'ZiG' },
});

// Fonte local usada antes da rede. Além de deixar o formulário instantâneo,
// evita que uma indisponibilidade do catálogo remoto bloqueie o orçamento.
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
  const sourceCurrency = String(from).toUpperCase();
  const targetCurrency = String(to).toUpperCase();
  if (sourceCurrency === targetCurrency) {
    return { success: true, rate: 1, date: todayKey(), source: 'Conversão direta' };
  }

  const cacheId = `${todayKey()}:${sourceCurrency}:${targetCurrency}`;
  const cached = readCache()[cacheId];
  if (cached) return { success: true, ...cached, cached: true };

  const rateSourceCurrency = RATE_PROXY_CODES[sourceCurrency] || sourceCurrency;
  const rateTargetCurrency = RATE_PROXY_CODES[targetCurrency] || targetCurrency;
  const proxyDescription = [sourceCurrency, targetCurrency]
    .filter(code => RATE_PROXY_CODES[code])
    .map(code => `${code}/${RATE_PROXY_CODES[code]}`)
    .join(', ');
  const base = rateSourceCurrency.toLowerCase();
  const quote = rateTargetCurrency.toLowerCase();

  try {
    // Fonte primária sem chave: mais de 200 códigos, incluindo todas as moedas
    // ISO retornadas pelo catálogo de países. Cripto/metais não entram no seletor.
    const response = await fetch(
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.min.json`
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const rate = Number(data?.[base]?.[quote]);
    if (!Number.isFinite(rate)) throw new Error('Cotação indisponível');

    const result = {
      rate,
      date: data.date || todayKey(),
      source: proxyDescription ? `Currency API (paridade ${proxyDescription})` : 'Currency API',
    };
    writeCache({ ...readCache(), [cacheId]: result });
    return { success: true, ...result };
  } catch {
    try {
      // Segundo provedor possui ampla cobertura de moedas fiduciárias e evita
      // indisponibilidade quando o CDN principal estiver fora do ar.
      const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(rateSourceCurrency)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const rate = Number(data?.rates?.[rateTargetCurrency]);
      if (data?.result !== 'success' || !Number.isFinite(rate)) throw new Error('Cotação indisponível');

      const result = {
        rate,
        date: data.time_last_update_unix
          ? new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
          : todayKey(),
        source: proxyDescription ? `ExchangeRate-API (paridade ${proxyDescription})` : 'ExchangeRate-API',
      };
      writeCache({ ...readCache(), [cacheId]: result });
      return { success: true, ...result };
    } catch {
      try {
        const response = await fetch(
          `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(rateSourceCurrency)}/${encodeURIComponent(rateTargetCurrency)}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const rate = Number(data?.rate);
        if (!Number.isFinite(rate)) throw new Error('Cotação indisponível');

        const result = {
          rate,
          date: data.date || todayKey(),
          source: proxyDescription ? `Frankfurter (paridade ${proxyDescription})` : 'Frankfurter',
        };
        writeCache({ ...readCache(), [cacheId]: result });
        return { success: true, ...result };
      } catch {
        return { success: false, error: 'Cotação indisponível agora. O roteiro pode ser criado sem conversão.' };
      }
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

const currencyFromCountry = country => {
  const [code, details] = Object.entries(country?.currencies || {})[0] || [];
  if (!code) return null;
  return {
    code: code.toUpperCase(),
    name: details?.name || code.toUpperCase(),
    symbol: details?.symbol || code.toUpperCase(),
  };
};

const loadAllCountryCurrencies = async () => {
  if (countryCurrenciesRequest) return countryCurrenciesRequest;

  countryCurrenciesRequest = (async () => {
    const response = await fetch(
      'https://cdn.jsdelivr.net/npm/world-countries@latest/dist/countries.json'
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const countries = await response.json();
    const nextCache = { ...readCountryCurrencyCache() };

    (countries || []).forEach(country => {
      const currency = currencyFromCountry(country);
      if (!currency) return;
      [country.cca2, country.cca3].filter(Boolean).forEach(code => {
        nextCache[String(code).toUpperCase()] = currency;
      });
    });

    writeCountryCurrencyCache(nextCache);
    return nextCache;
  })().finally(() => {
    countryCurrenciesRequest = null;
  });

  return countryCurrenciesRequest;
};

export const getCountryCurrency = async countryCode => {
  const normalizedCode = String(countryCode || '').toUpperCase();
  if (!normalizedCode) return { success: false, error: 'País inválido.' };

  const override = COUNTRY_CURRENCY_OVERRIDES[normalizedCode];
  if (override) return { success: true, ...override, source: 'Base atualizada' };

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
    const allCurrencies = await loadAllCountryCurrencies();
    const currency = allCurrencies[normalizedCode];
    if (currency) return { success: true, ...currency, source: 'World Countries' };
    throw new Error('Moeda não encontrada');
  } catch {
    return { success: false, error: 'Não foi possível identificar a moeda deste destino.' };
  }
};

export const sanitizeMoneyInput = value => {
  const raw = String(value ?? '').replace(/[^\d,.]/g, '');
  if (!raw) return '';

  if (raw.includes(',')) {
    const [integer = '', ...decimalParts] = raw.replace(/\./g, '').split(',');
    const decimals = decimalParts.join('').slice(0, 2);
    const separator = raw.endsWith(',') && !decimals ? ',' : decimals ? `,${decimals}` : '';
    return `${integer.replace(/^0+(?=\d)/, '') || '0'}${separator}`;
  }

  const dotParts = raw.split('.');
  if (dotParts.length === 2 && dotParts[1].length <= 2) {
    return `${dotParts[0].replace(/^0+(?=\d)/, '') || '0'},${dotParts[1]}`;
  }
  return raw.replace(/\./g, '').replace(/^0+(?=\d)/, '');
};

export const parseMoneyInput = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const sanitized = sanitizeMoneyInput(value);
  return Number(sanitized.replace(',', '.')) || 0;
};

export const formatMoneyInput = (value) => {
  const number = parseMoneyInput(value);
  return number
    ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(number)
    : '';
};

