import { getAlpha2, getAlpha3 } from './countryUtils';

// The source GeoJSON uses -99 for a few valid sovereign countries.
const GEO_COUNTRY_ALPHA3_OVERRIDES = {
  France: 'FRA',
  Norway: 'NOR',
};

const isValidIsoCode = (code, length) =>
  typeof code === 'string' && code.length === length && code !== '-99';

export const getGeoCountryName = (feature) =>
  feature?.properties?.name || feature?.properties?.ADMIN || '';

export const getGeoCountryAlpha3 = (feature) => {
  const properties = feature?.properties;
  if (!properties) return null;

  const alpha3 = properties['ISO3166-1-Alpha-3']?.toUpperCase();
  if (isValidIsoCode(alpha3, 3)) return alpha3;

  const alpha2 = properties['ISO3166-1-Alpha-2']?.toUpperCase();
  if (isValidIsoCode(alpha2, 2)) return getAlpha3(alpha2);

  return GEO_COUNTRY_ALPHA3_OVERRIDES[getGeoCountryName(feature)] || null;
};

export const getGeoCountryAlpha2 = (feature) => {
  const alpha3 = getGeoCountryAlpha3(feature);
  return alpha3 ? getAlpha2(alpha3)?.toUpperCase() || null : null;
};
