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
