import { ALPHA3_TO_ALPHA2 } from './countryUtils';

// England/Scotland/Wales have official Unicode subdivision flag sequences.
// Northern Ireland has no single widely-recognized flag, so it falls back to the UK flag.
const UK_SUBDIVISION_TAGS = {
  'GB-ENG': 'gbeng',
  'GB-SCT': 'gbsct',
  'GB-WLS': 'gbwls',
};

const subdivisionFlagEmoji = (tag) => {
  const BLACK_FLAG = String.fromCodePoint(0x1f3f4);
  const CANCEL_TAG = String.fromCodePoint(0xe007f);
  const chars = tag
    .split('')
    .map(c => String.fromCodePoint(0xe0000 + c.charCodeAt(0)))
    .join('');
  return BLACK_FLAG + chars + CANCEL_TAG;
};

export const getFlagEmoji = (code) => {
  if (!code || typeof code !== 'string') return '🌐';
  const upper = code.trim().toUpperCase();

  if (UK_SUBDIVISION_TAGS[upper]) {
    return subdivisionFlagEmoji(UK_SUBDIVISION_TAGS[upper]);
  }
  if (upper === 'GB-NIR') {
    return '🇬🇧';
  }

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

  return '🌐';
};
