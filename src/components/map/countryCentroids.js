// Ponto de ancoragem do badge de cada país no globo.
//
// O centroide esférico do país inteiro (d3.geoCentroid) erra em país com
// território disperso: nos EUA o Alasca e o Havaí puxam o ponto para fora dos 48
// contíguos. Então ancoramos no centroide da MAIOR parte contínua do país, que é
// onde alguém espera ver o rótulo.
//
// Módulo puro (só d3-geo, que já é dependência do projeto): roda no browser e é
// exercitado direto nos testes.
import { geoCentroid, geoArea } from 'd3-geo';
import { getGeoCountryAlpha3 } from '../../utils/geo-country-utils';
import { applyCoordinateOverride } from './countryCoordinateOverrides';

const polygonsOf = (geometry) => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
};

// Meia esfera, em esterradianos. Nenhum país cobre mais que isso — nem a Rússia
// chega perto —, então área maior que este limite só pode ser erro de leitura.
const HEMISPHERE = 2 * Math.PI;

const areaOf = (coordinates) => geoArea({ type: 'Polygon', coordinates });

/**
 * Corrige o sentido dos anéis de um polígono, quando ele vem invertido.
 *
 * Geometria esférica não tem "dentro" óbvio: um anel fechado divide a esfera em
 * duas partes de tamanho parecido, e quem decide qual delas é o país é o SENTIDO
 * do anel (o GeoJSON pede anti-horário para a borda externa, RFC 7946). Um
 * dataset que grava no sentido contrário faz o d3-geo ler o COMPLEMENTO — "todo
 * o globo menos a Inglaterra" —, e aí a área vira quase a esfera inteira e o
 * centróide cai no antípoda, a 19 mil km de distância.
 *
 * Foi o que aconteceu com as 4 nações do Reino Unido: o arquivo do ONS vem com
 * os anéis no sentido horário, e a busca voava para o meio do Pacífico.
 *
 * Detectar é simples e não depende de conhecer o dataset: se a área passou de
 * meio globo, o que foi medido é o complemento. Inverter a ordem dos pontos de
 * cada anel devolve a leitura certa.
 *
 * @param {number[][][]} coordinates anéis de um polígono
 * @returns {{ coordinates: number[][][], area: number }}
 */
const withCorrectWinding = (coordinates) => {
  const area = areaOf(coordinates);
  if (area <= HEMISPHERE) return { coordinates, area };

  const flipped = coordinates.map((ring) => [...ring].reverse());
  return { coordinates: flipped, area: areaOf(flipped) };
};

/**
 * Centroide da maior parte contínua, mais a área total (em esterradianos).
 *
 * A área serve de critério de prioridade quando dois badges disputam espaço:
 * país maior fica com o rótulo escrito. É um número que não depende da câmera,
 * então a decisão não muda a cada frame — badge que troca de estado sozinho
 * enquanto o usuário só arrasta o globo lê como bug.
 *
 * @param {number[][][][]} polygons anéis de todos os polígonos do país
 * @returns {{ lng: number, lat: number, area: number } | null}
 */
const anchorOfPolygons = (polygons) => {
  if (polygons.length === 0) return null;

  let largest = polygons[0];
  let largestArea = -1;
  let totalArea = 0;

  for (const polygon of polygons) {
    const { coordinates, area } = withCorrectWinding(polygon);
    totalArea += area;
    if (area > largestArea) {
      largestArea = area;
      largest = coordinates;
    }
  }

  const [lng, lat] = geoCentroid({ type: 'Polygon', coordinates: largest });
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  return { lng, lat, area: totalArea };
};

/**
 * Âncora de uma feature isolada.
 *
 * @param {any} feature feature GeoJSON de país
 * @returns {{ lng: number, lat: number, area: number } | null}
 */
export const getCountryAnchor = (feature) => anchorOfPolygons(polygonsOf(feature?.geometry));

/**
 * Mapa alpha3 -> âncora para todas as features com código ISO reconhecido.
 *
 * Junta TODAS as features do mesmo código antes de calcular. Vários datasets de
 * fronteiras quebram um país em mais de uma feature (partes separadas, enclaves,
 * ilhas), e ficar com a primeira que aparece jogava a âncora numa ilha
 * qualquer: o badge ia parar no meio do oceano, quase sempre do lado escondido
 * do globo — o país entrava na lista e nunca aparecia.
 *
 * No fim, a lista de exceções (countryCoordinateOverrides.js) tem a última
 * palavra sobre a POSIÇÃO, para os punhados de países cuja forma nenhum
 * centróide resolve.
 *
 * @param {{ features: any[] } | null} geoData
 * @returns {Record<string, { lng: number, lat: number, area: number }>}
 */
export const buildCountryAnchors = (geoData) => {
  /** @type {Map<string, number[][][][]>} */
  const byCode = new Map();

  for (const feature of geoData?.features ?? []) {
    const code = getGeoCountryAlpha3(feature);
    if (!code) continue;

    const polygons = polygonsOf(feature.geometry);
    if (polygons.length === 0) continue;

    const bucket = byCode.get(code);
    if (bucket) bucket.push(...polygons);
    else byCode.set(code, [...polygons]);
  }

  const anchors = /** @type {Record<string, { lng: number, lat: number, area: number }>} */ ({});
  for (const [code, polygons] of byCode) {
    const anchor = anchorOfPolygons(polygons);
    if (anchor) anchors[code] = applyCoordinateOverride(code, anchor);
  }
  return anchors;
};
