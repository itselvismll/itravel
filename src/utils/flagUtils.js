import { ALPHA3_TO_ALPHA2 } from './countryUtils';

export const getFlagEmoji = (code) => {
  if (!code || typeof code !== 'string') return '🌍';
  const upper = code.trim().toUpperCase();

  if (upper.length === 2) {
    return upper
      .split('')
      .map(c => String.fromCodePoint(127397 + c.charCodeAt(0)))
      .join('');
  }

  if (upper.length === 3) {
    const alpha2 = (ALPHA3_TO_ALPHA2[upper] || '').toUpperCase();
    if (alpha2.length === 2) {
      return alpha2
        .split('')
        .map(c => String.fromCodePoint(127397 + c.charCodeAt(0)))
        .join('');
    }
  }

  return '🌍';
};
