import ukNationsGeoData from '../data/geo/uk-nations.json';
import { getGeoCountryAlpha3 } from '../utils/geo-country-utils';

// Fronteiras do mundo, servidas pelo próprio app a partir de public/geo.
//
// Antes isto apontava para raw.githubusercontent.com. O arquivo de lá tem 14,6 MB
// (4,4 MB gzip) e 548.472 vértices, e vem com `cache-control: max-age=300` — cinco
// minutos, ou seja, baixado de novo a cada sessão. A versão simplificada tem
// 0,64 MB e 38.181 vértices (-93%), e sai do mesmo host do app, com o cache dele.
//
// O arquivo é gerado por scripts/build-country-geojson.cjs e versionado no git.
//
// O prefixo é o mesmo truque de GlobeMap.web.js: no web `EXPO_BASE_URL` é vazio e
// a URL resolve na raiz do site; dentro do DOM Component nativo o documento é
// servido por uma URL interna do Expo, e sem o prefixo o arquivo seria procurado
// em `file:///geo/...` e não existiria.
const publicBaseUrl = (process.env.EXPO_BASE_URL || '/').replace(/\/?$/, '/');
const GEOJSON_URL = `${publicBaseUrl}geo/countries.json`;

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
