import ukNationsGeoData from '../data/geo/uk-nations.json';
import { getGeoCountryAlpha3 } from '../utils/geo-country-utils';

const GEOJSON_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

let countriesPromise;

// England/Scotland/Wales/Northern Ireland boundaries (ONS Open Geography Portal,
// "Countries (December 2024) Boundaries UK BUC", simplified). Bundled locally since it's
// small, stable data — no need for a second live fetch.
export const getUkNationsGeoData = () => ukNationsGeoData.features;

/**
 * Troca a feature única do Reino Unido pelas suas 4 nações.
 *
 * O app trata Inglaterra, Escócia, País de Gales e Irlanda do Norte como países
 * independentes: cada um tem código ISO 3166-2 próprio (GB-ENG, GB-SCT, GB-WLS,
 * GB-NIR), dados estáticos, bandeira e conquista. O que faltava era a GEOMETRIA
 * — o dataset mundial traz só um polígono "United Kingdom", e por isso o mapa
 * pintava o reino inteiro quando alguém marcava só a Escócia.
 *
 * O GBR sai da coleção em vez de conviver com as 4: os polígonos se sobrepõem
 * exatamente, e manter os dois faria duas camadas disputando o mesmo pixel — a
 * cor de quem estivesse por cima venceria, e marcar a Inglaterra pintaria (ou
 * não) o reino inteiro dependendo da ordem das features. Quem já marcou "Reino
 * Unido" antes desta mudança não perde nada: ver expandUkNations.
 *
 * Função pura para poder ser exercitada sem rede.
 *
 * @param {{ type?: string, features?: any[] } | null} geoData coleção mundial
 * @param {any[]} [nations] features das 4 nações
 * @returns {{ type: string, features: any[] }}
 */
export const withUkNations = (geoData, nations = getUkNationsGeoData()) => {
  const features = (geoData?.features ?? []).filter(
    (feature) => getGeoCountryAlpha3(feature) !== 'GBR'
  );

  return {
    ...geoData,
    type: geoData?.type ?? 'FeatureCollection',
    features: [...features, ...nations],
  };
};

export const getWorldGeoData = () => {
  if (!countriesPromise) {
    countriesPromise = fetch(GEOJSON_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Não foi possível carregar o mapa (${response.status})`);
        return response.json();
      })
      // A correção do Reino Unido entra aqui, na fonte, e não em cada tela: o
      // globo, o passaporte e qualquer coisa que venha depois enxergam o mesmo
      // mundo. Uma tela que corrigisse por conta própria discordaria das outras
      // sobre quantos países existem.
      .then(withUkNations)
      .catch((error) => {
        countriesPromise = undefined;
        throw error;
      });
  }
  return countriesPromise;
};
