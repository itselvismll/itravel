// Medidas geográficas usadas pelo roteiro no mapa: distância entre dois pontos,
// tempo a pé e ponto-dentro-de-polígono.
//
// Módulo puro: sem rede, sem DOM, sem mapa. É a metade da feature "o que tem por
// perto" que NÃO depende de qual biblioteca desenha o mapa — por isso ele vive
// em utils e não em components/map. O globo web, o DOM Component do
// iOS/Android e qualquer renderer que venha depois chamam exatamente estas
// funções.

// Raio médio da Terra, em metros (IUGG). A haversine assume esfera; para as
// distâncias desta feature (algumas centenas de metros a pé) o erro do modelo
// esférico contra o elipsoide fica na casa de 0,3% — bem abaixo da imprecisão de
// quem estima uma caminhada em minutos.
const EARTH_RADIUS_METERS = 6371008.8;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Distância em metros entre dois pares [longitude, latitude].
 *
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @returns {number} metros, ou NaN se alguma coordenada não for finita
 */
export const distanceMeters = (from, to) => {
  const [fromLng, fromLat] = from ?? [];
  const [toLng, toLat] = to ?? [];
  if (
    !Number.isFinite(fromLng) || !Number.isFinite(fromLat)
    || !Number.isFinite(toLng) || !Number.isFinite(toLat)
  ) {
    return Number.NaN;
  }

  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * Velocidade de caminhada, em metros por minuto.
 *
 * 80 m/min = 4,8 km/h, a média que o Mapbox usa no perfil `walking` da própria
 * Isochrone. Usar a mesma velocidade da API mantém a lista coerente com a área
 * desenhada: um lugar que aparece como "12 min" não pode estar fora de um
 * contorno de 15 minutos calculado com outro passo.
 */
export const WALKING_METERS_PER_MINUTE = 80;

/**
 * Minutos a pé para percorrer uma distância EM LINHA RETA.
 *
 * É uma estimativa, e por baixo: ninguém atravessa quarteirão na diagonal. Serve
 * para ORDENAR a lista e dar a noção de perto/longe — a resposta precisa de até
 * onde dá para ir continua sendo o polígono da isócrona, que segue as ruas.
 * Nunca devolve zero: "0 min a pé" lê como erro, não como "é logo ali".
 *
 * @param {number} meters
 * @returns {number} minutos inteiros, mínimo 1; NaN entra e NaN sai
 */
export const walkingMinutes = (meters) => {
  if (!Number.isFinite(meters)) return Number.NaN;
  return Math.max(1, Math.round(meters / WALKING_METERS_PER_MINUTE));
};

/**
 * O ponto está dentro de um anel (array de [lng, lat])?
 *
 * Ray casting clássico: conta quantas vezes uma semirreta horizontal partindo do
 * ponto cruza as arestas do anel. Ímpar = dentro.
 */
const insideRing = (ring, longitude, latitude) => {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i] ?? [];
    const [xj, yj] = ring[j] ?? [];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    if (!Number.isFinite(xj) || !Number.isFinite(yj)) continue;

    // A aresta cruza a latitude do ponto? O teste com `!==` cobre os dois
    // sentidos de travessia de uma vez e, por ser estrito nos dois extremos,
    // conta um vértice exatamente uma vez — sem ele, um ponto alinhado com um
    // vértice seria contado duas e cairia "fora" de onde está dentro.
    const crosses = yi > latitude !== yj > latitude;
    if (!crosses) continue;

    const intersectionX = ((xj - xi) * (latitude - yi)) / (yj - yi) + xi;
    if (longitude < intersectionX) inside = !inside;
  }

  return inside;
};

/**
 * O ponto está dentro de uma geometria Polygon ou MultiPolygon?
 *
 * Buracos contam: um polígono é `[anel externo, buraco, buraco, ...]`, e a
 * isócrona TEM buracos — o quarteirão fechado, o parque sem travessia, a área
 * militar no meio do bairro. Ignorá-los colocaria na lista lugares que a API já
 * disse que não dá para alcançar a pé.
 *
 * Coordenada inválida devolve `false`, nunca lança: esta função roda sobre dados
 * que vieram da rede.
 *
 * @param {[number, number]} coordinates par [longitude, latitude]
 * @param {{ type?: string, coordinates?: any } | null} geometry
 * @returns {boolean}
 */
export const isInsidePolygon = (coordinates, geometry) => {
  const [longitude, latitude] = coordinates ?? [];
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;

  const polygons =
    geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates
        : null;
  if (!Array.isArray(polygons)) return false;

  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0])) continue;
    if (!insideRing(polygon[0], longitude, latitude)) continue;

    // Dentro do anel externo: só está de fato dentro se não cair em buraco nenhum.
    const inHole = polygon
      .slice(1)
      .some((hole) => Array.isArray(hole) && insideRing(hole, longitude, latitude));
    if (!inHole) return true;
  }

  return false;
};

/**
 * Caixa envolvente de uma geometria, como `[oeste, sul, leste, norte]`.
 *
 * Existe para descartar candidatos antes do teste caro: comparar quatro números
 * elimina quase todo mundo, e só o que sobra paga o ray casting. É o que torna
 * viável resolver "em que país está esta parada" contra as fronteiras do mundo
 * inteiro sem travar a tela.
 *
 * @param {{ type?: string, coordinates?: any } | null} geometry
 * @returns {[number, number, number, number] | null}
 */
export const geometryBounds = (geometry) => {
  const polygons =
    geometry?.type === 'Polygon' ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon' ? geometry.coordinates
        : null;
  if (!Array.isArray(polygons)) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const polygon of polygons) {
    for (const [longitude, latitude] of polygon?.[0] ?? []) {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
      west = Math.min(west, longitude);
      east = Math.max(east, longitude);
      south = Math.min(south, latitude);
      north = Math.max(north, latitude);
    }
  }

  return Number.isFinite(west) ? [west, south, east, north] : null;
};
