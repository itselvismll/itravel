// A lista de "o que tem por perto": pega os lugares que o Mapbox devolveu, o
// polígono da isócrona e a parada de origem, e decide o que aparece na folha e
// em que ordem.
//
// Módulo puro — sem rede, sem mapa, sem React. A busca é do mapboxPlaces.js, a
// área é do mapboxIsochrone.js, o desenho é da folha; o que fica aqui é a REGRA,
// que é a parte que as três plataformas compartilham.
import { distanceMeters, isInsidePolygon, walkingMinutes } from './geoMeasure';
import { normalizeSearchText } from './geoSearch';
import { CATEGORY_LABEL } from '../services/mapboxPlaces';

/** Quantos lugares a folha mostra antes do "Ver mais". */
export const NEARBY_PREVIEW_COUNT = 5;

/**
 * Teto absoluto da lista.
 *
 * A folha é um complemento da área desenhada, não um guia da cidade. Doze linhas
 * já obrigam a rolar; mais do que isso é uma tela nova, e a tela nova é
 * exatamente o que não pode acontecer aqui.
 */
export const NEARBY_MAX_COUNT = 12;

/**
 * O lugar é a própria parada?
 *
 * A Search Box devolve o ponto turístico em que o usuário tocou, porque ele é um
 * POI como qualquer outro. "Coliseu, a 1 min a pé do Coliseu" lê como bug.
 * O nome normalizado é o critério — a distância sozinha não serve, porque o café
 * da esquina também está a 20 metros e ele TEM de aparecer.
 */
const isOrigin = (place, originName) => {
  if (!originName) return false;
  return normalizeSearchText(place?.name) === originName;
};

/**
 * Ordena, filtra e corta a lista que a folha mostra.
 *
 * A área manda: um lugar fora do polígono não entra, mesmo que esteja a 300
 * metros em linha reta. É a diferença que dá sentido à feature — do outro lado
 * do Tibre são 300 metros de distância e 22 minutos de caminhada, e uma lista que
 * ignorasse isso contradiria o desenho no mapa.
 *
 * @param {Array<any> | null} places saída de fetchNearbyPlaces
 * @param {{
 *   origin?: { latitude: number, longitude: number, title?: string } | null,
 *   area?: { geometry?: any } | null,
 *   limit?: number,
 * }} [options]
 * @returns {Array<{id:string,name:string,category:string,categoryLabel:string,
 *   meters:number,minutes:number,longitude:number,latitude:number}>}
 */
export const selectNearbyPlaces = (places, options = {}) => {
  const { origin, area, limit = NEARBY_MAX_COUNT } = options;
  if (!Array.isArray(places) || !origin) return [];

  const from = /** @type {[number, number]} */ ([origin.longitude, origin.latitude]);
  const originName = normalizeSearchText(origin.title || '');
  const geometry = area?.geometry ?? null;

  /** @type {Map<string, any>} */
  const byName = new Map();

  for (const place of places) {
    if (!place || isOrigin(place, originName)) continue;

    const to = /** @type {[number, number]} */ ([place.longitude, place.latitude]);
    // Sem área desenhada a lista ainda funciona: ela vira "os mais próximos",
    // que é uma resposta pior mas honesta. Acontece quando a isócrona falhou e a
    // busca não — não há razão para punir o usuário duas vezes.
    if (geometry && !isInsidePolygon(to, geometry)) continue;

    const meters = distanceMeters(from, to);
    if (!Number.isFinite(meters)) continue;

    // A mesma cadeia aparece duas vezes na resposta com `mapbox_id` diferente
    // (a loja e o shopping que a abriga, o museu e o jardim dele). Fica a mais
    // perto, que é a que responde à pergunta.
    const key = normalizeSearchText(place.name);
    const existing = byName.get(key);
    if (existing && existing.meters <= meters) continue;

    byName.set(key, {
      ...place,
      categoryLabel: CATEGORY_LABEL[place.category] || CATEGORY_LABEL.outro,
      meters,
      minutes: walkingMinutes(meters),
    });
  }

  return [...byName.values()]
    .sort((a, b) => a.meters - b.meters)
    .slice(0, Math.max(0, Math.min(limit, NEARBY_MAX_COUNT)));
};

/**
 * Caixa da área, no formato que a busca por categoria aceita como `bbox`.
 *
 * Recortar a busca pela caixa da isócrona é o que impede a API de gastar o
 * limite de resultados com lugares que o filtro de polígono descartaria logo
 * depois: sem ela, os 25 resultados podem voltar todos do bairro vizinho, e a
 * folha ficaria vazia com a área cheia.
 *
 * @param {[number, number, number, number] | null} bounds
 * @returns {[number, number, number, number] | null}
 */
export const nearbySearchBbox = (bounds) =>
  (Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isFinite) ? bounds : null);
