import ukNationsGeoData from '../data/geo/uk-nations.json';
import { getGeoCountryAlpha3 } from '../utils/geo-country-utils';

// Fronteiras do mundo, empacotadas junto com o app (import dinâmico).
//
// Antes isto apontava para raw.githubusercontent.com. O arquivo de lá tem 14,6 MB
// (4,4 MB gzip) e 548.472 vértices, e vem com `cache-control: max-age=300` — cinco
// minutos, ou seja, baixado de novo a cada sessão. A versão simplificada tem
// 0,64 MB e 38.181 vértices (-93%).
//
// Depois isto virou um fetch('/geo/countries.json') servido por public/geo — mas
// a WebView nativa do globo (NativeGlobe.dom.js) carrega de `file:///android_asset/
// www.bundle/...`, e a WebView do Android bloqueia fetch()/XMLHttpRequest para o
// esquema file:// por padrão. O fetch falhava sempre lá dentro (TypeError: Failed
// to fetch), mesmo com o arquivo certinho dentro do APK — e nunca falhou no web
// porque lá a página é servida por https://, não file://.
//
// Por isso agora é import() dinâmico: o Metro resolve e empacota o JSON como
// módulo, sem rede nenhuma — mesmo princípio do uk-nations.json (import estático),
// só que lazy porque aqui são 672 KB e não convém inflar o bundle principal com
// eles sempre que o módulo é carregado.
//
// O arquivo é gerado por scripts/build-country-geojson.cjs e versionado no git.
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
    countriesPromise = import('../data/geo/countries.json')
      .then((module) => module.default ?? module)
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
