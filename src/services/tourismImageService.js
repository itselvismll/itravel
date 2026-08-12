import { fetch } from 'expo/fetch';

const CACHE_KEY = 'journi.tourismImages.v1';
let memoryCache = {};

const readCache = () => {
  if (typeof globalThis.localStorage === 'undefined') return memoryCache;
  try { return JSON.parse(globalThis.localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
};

const writeCache = cache => {
  memoryCache = cache;
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
};

export const getTourismImage = async (countryCode, countryName) => {
  const key = String(countryCode || countryName || '').toUpperCase();
  const cached = readCache()[key];
  if (cached) return cached;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `tourism landmarks ${countryName}`,
    gsrnamespace: '6',
    gsrlimit: '8',
    prop: 'imageinfo',
    iiprop: 'url|mime',
    iiurlwidth: '900',
  });

  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const pages = Object.values(data?.query?.pages || {});
    const page = pages.find(item => (
      item?.imageinfo?.[0]?.thumburl
      && /^image\/(jpeg|png|webp)$/i.test(item.imageinfo[0].mime || '')
    ));
    if (!page) return null;
    const result = {
      url: page.imageinfo[0].thumburl,
      sourceUrl: page.imageinfo[0].descriptionurl || 'https://commons.wikimedia.org/',
      source: 'Wikimedia Commons',
    };
    writeCache({ ...readCache(), [key]: result });
    return result;
  } catch {
    return null;
  }
};
