// Em que país está cada parada do roteiro, e quais bandeiras continuam no globo
// enquanto um roteiro está aplicado.
//
// POR QUE ISTO EXISTE: com o roteiro na tela, as bandeiras de todos os países
// competem com os pinos numerados e com o traçado do dia — três informações
// disputando o mesmo pixel. Enquanto há roteiro, só os países POR ONDE ELE PASSA
// mantêm badge; o resto continua pintado no território (countryFill), que é uma
// camada que não flutua por cima de nada.
//
// A bandeira não some do app: ela reaparece no cabeçalho da parada, dentro da
// folha, que é onde ela responde a uma pergunta ("que país é este?") em vez de só
// ocupar espaço.
//
// Módulo puro: recebe pontos e GeoJSON, devolve códigos. Sem mapa e sem DOM, ele
// roda onde a geometria estiver — na GlobeScreen web, que já carrega o mundo, e
// dentro do DOM Component do iOS/Android, que é o dono da geometria lá.
import { geometryBounds, isInsidePolygon } from '../../utils/geoMeasure';
import { getGeoCountryAlpha3 } from '../../utils/geo-country-utils';

/**
 * Caixa de cada país, calculada uma vez por feature.
 *
 * Resolver "em que país está este ponto" contra as fronteiras do mundo é ~240
 * polígonos, alguns com milhares de vértices. Comparar quatro números antes
 * descarta quase todos: a Rússia e o Brasil saem da conta de uma parada em Roma
 * sem que um único vértice seja testado. O WeakMap guarda o resultado sem segurar
 * a coleção na memória depois que ela sai de cena.
 *
 * @type {WeakMap<object, [number, number, number, number] | null>}
 */
const boundsCache = new WeakMap();

const boundsOf = (feature) => {
  if (boundsCache.has(feature)) return boundsCache.get(feature);
  const bounds = geometryBounds(feature?.geometry);
  boundsCache.set(feature, bounds);
  return bounds;
};

/**
 * O alpha-3 do país que contém o ponto, ou `null`.
 *
 * `null` é um resultado legítimo, não um erro: uma parada pode ser um ferry, uma
 * ilha que o dataset simplificado não tem, ou uma coordenada na água a poucos
 * metros da costa. Quem chama trata como "sem bandeira".
 *
 * @param {{ latitude: number, longitude: number }} point
 * @param {{ features?: any[] } | null} geoData
 * @returns {string | null}
 */
export const countryCodeAt = (point, geoData) => {
  const longitude = point?.longitude;
  const latitude = point?.latitude;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  for (const feature of geoData?.features ?? []) {
    const bounds = boundsOf(feature);
    if (!bounds) continue;

    const [west, south, east, north] = bounds;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;

    if (isInsidePolygon([longitude, latitude], feature.geometry)) {
      return getGeoCountryAlpha3(feature);
    }
  }

  return null;
};

/**
 * O país de cada parada, na mesma ordem dos pontos.
 *
 * Um array paralelo, e não um campo novo nos pontos: `getPlanPoints` é a fonte da
 * verdade do formato de uma parada, e o país não é um dado do roteiro — é uma
 * dedução que só existe onde há geometria carregada.
 *
 * @param {Array<{latitude:number, longitude:number}>} points
 * @param {{ features?: any[] } | null} geoData
 * @returns {Array<string | null>}
 */
export const planPointCountries = (points, geoData) => {
  const list = points ?? [];
  if (!geoData?.features?.length) return list.map(() => null);

  // Paradas do mesmo dia costumam cair no mesmo país; a maioria dos roteiros
  // inteiros cai em um só. Guardar a última resposta por coordenada arredondada
  // evita varrer o mundo de novo para cada uma das trinta paradas de Roma.
  /** @type {Map<string, string | null>} */
  const memo = new Map();

  return list.map((point) => {
    const key = `${Math.round(point?.longitude * 10) / 10},${Math.round(point?.latitude * 10) / 10}`;
    if (memo.has(key)) return memo.get(key);
    const code = countryCodeAt(point, geoData);
    memo.set(key, code);
    return code;
  });
};

/**
 * Os países que mantêm badge no globo.
 *
 * Sem roteiro aplicado, nada muda: a lista volta inteira e o globo é o de sempre.
 *
 * @param {Array<{code?: string}>} countries
 * @param {Array<string | null> | Set<string>} planCodes códigos por onde o
 *   roteiro passa
 * @param {boolean} hasPlan há roteiro aplicado?
 * @returns {Array<any>}
 */
export const badgeCountries = (countries, planCodes, hasPlan) => {
  const list = countries ?? [];
  if (!hasPlan) return list;

  const allowed = planCodes instanceof Set ? planCodes : new Set((planCodes ?? []).filter(Boolean));

  // Roteiro cujo país nenhum foi resolvido (geometria ainda carregando, paradas
  // sem coordenada): esconder TODOS os badges deixaria o globo sem referência
  // nenhuma. Nesse caso a lista volta inteira — o estado degradado é o de antes.
  if (!allowed.size) return list;

  return list.filter((country) => allowed.has(country?.code));
};
