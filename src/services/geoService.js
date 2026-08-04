import ukNationsGeoData from '../data/geo/uk-nations.json';

const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

let countriesPromise;

export const getWorldGeoData = () => {
  if (!countriesPromise) {
    countriesPromise = fetch(GEOJSON_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Não foi possível carregar o mapa (${response.status})`);
        return response.json();
      })
      .catch((error) => {
        countriesPromise = undefined;
        throw error;
      });
  }
  return countriesPromise;
};

// England/Scotland/Wales/Northern Ireland boundaries (ONS Open Geography Portal,
// "Countries (December 2024) Boundaries UK BUC", simplified). Bundled locally since it's
// small, stable data — no need for a second live fetch. "United Kingdom" (GBR) stays as
// its own single feature in the main world dataset for people who want to log the UK as
// a whole; these 4 are additional, independent, selectable entries.
export const getUkNationsGeoData = () => ukNationsGeoData.features;
