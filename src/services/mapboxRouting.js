// Ordem e traçado do roteiro, pelas APIs de navegação do Mapbox.
//
// Duas chamadas, nesta ordem, POR DIA:
//   1. Optimization v1 — recebe os pontos na ordem que a IA sugeriu e devolve a
//      sequência de menor deslocamento.
//   2. Directions v5 — recebe a sequência já otimizada e devolve a geometria da
//      rota real, seguindo ruas, para virar a linha desenhada no globo.
//
// REGRA DA CASA: nada aqui lança. Toda função devolve o melhor resultado que
// conseguiu — na pior das hipóteses, os pontos exatamente como a IA os mandou e
// uma linha reta entre eles. Um roteiro que o usuário salvou tem de aparecer no
// mapa mesmo com a rede caída, o token vencido ou a cota estourada; o que se
// perde é o refinamento, nunca a tela.
//
// O módulo não importa nada de mapa nem de React: recebe pontos, devolve pontos
// e coordenadas. É o que permite exercitá-lo com um `fetch` falso no teste.
import { API_CONFIG } from '../utils/constants';

const MAPBOX_ORIGIN = 'https://api.mapbox.com';

/** Tetos das próprias APIs, não escolhas nossas.
 * https://docs.mapbox.com/api/navigation/optimization-v1/
 * https://docs.mapbox.com/api/navigation/directions/ */
export const OPTIMIZATION_MAX_COORDINATES = 12;
export const DIRECTIONS_MAX_COORDINATES = 25;

/** Menos de dois pontos não é trajeto: não há o que otimizar nem o que traçar. */
const MIN_COORDINATES = 2;

// `driving` e não `walking`: um dia de roteiro costuma cruzar a cidade, e o
// perfil a pé recusa pares muito distantes — a rota voltaria vazia justamente
// nos trechos em que a linha reta engana mais.
export const DEFAULT_ROUTING_PROFILE = 'driving';

// Teto de espera por requisição. O roteiro já está na tela quando estas chamadas
// saem; passado esse tempo, o refinamento não vale mais a pena e o fallback
// assume.
const REQUEST_TIMEOUT_MS = 8000;

/** `lng,lat;lng,lat` — a ordem que as duas APIs esperam, que é o inverso do
 * `latitude, longitude` com que o resto do app trabalha. */
const toCoordinatePath = (points) =>
  points.map((point) => `${point.longitude},${point.latitude}`).join(';');

/**
 * `fetch` com timeout e sem exceção.
 *
 * Devolve o JSON ou `null`. O `null` é o único canal de erro daqui para cima —
 * quem chama não precisa distinguir 403 de timeout de JSON malformado, porque a
 * reação é a mesma em todos os casos: usar o fallback.
 */
const getJson = async (url, signal) => {
  // AbortSignal.any junta o cancelamento do chamador (componente desmontou) com
  // o do timeout. Onde ele não existir, o timeout ainda vale sozinho.
  const timeout = AbortSignal.timeout?.(REQUEST_TIMEOUT_MS);
  const combined =
    signal && timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout || signal;

  try {
    const response = await fetch(url, { signal: combined });
    if (!response.ok) return null;
    const body = await response.json();
    // As duas APIs sinalizam falha no corpo, com HTTP 200: sem esta checagem um
    // "NoRoute" passaria por sucesso e devolveria uma rota vazia.
    return body?.code === 'Ok' ? body : null;
  } catch {
    return null;
  }
};

const token = () => API_CONFIG.MAPBOX_TOKEN;

/**
 * Reordena os pontos de um dia na sequência de menor deslocamento.
 *
 * O primeiro e o último ponto ficam FIXOS (`source=first`, `destination=last`).
 * É a única combinação que a API aceita com `roundtrip=false`, e também a que
 * respeita o roteiro: a IA escolheu onde o dia começa e onde ele termina — o
 * café da manhã perto do hotel, o jantar antes de voltar —, e essa intenção não
 * é ineficiência a ser corrigida. O que se otimiza é o miolo.
 *
 * Acima de 12 pontos a API recusa a requisição, e um dia assim volta na ordem da
 * IA. Não vale quebrar o dia em pedaços: otimizar metades separadas dá uma
 * ordem pior do que a original, com um salto no meio.
 *
 * @param {Array<{latitude:number, longitude:number}>} points
 * @param {{ signal?: AbortSignal, profile?: string }} [options]
 * @returns {Promise<{ points: Array<any>, optimized: boolean }>}
 */
export const optimizePointOrder = async (points, options = {}) => {
  const list = points ?? [];
  const fallback = { points: list, optimized: false };

  if (!token()) return fallback;
  if (list.length < MIN_COORDINATES || list.length > OPTIMIZATION_MAX_COORDINATES) return fallback;

  const { signal, profile = DEFAULT_ROUTING_PROFILE } = options;
  const url =
    `${MAPBOX_ORIGIN}/optimized-trips/v1/mapbox/${profile}/${toCoordinatePath(list)}`
    + `?source=first&destination=last&roundtrip=false&access_token=${token()}`;

  const body = await getJson(url, signal);
  const waypoints = body?.waypoints;
  if (!Array.isArray(waypoints) || waypoints.length !== list.length) return fallback;

  // `waypoints` volta na ordem em que ENVIAMOS, e cada um carrega o
  // `waypoint_index`, que é a posição dele na viagem otimizada. Então a leitura
  // é uma dispersão, não uma ordenação: o ponto i vai para a casa
  // waypoint_index[i].
  const ordered = new Array(list.length);
  for (let index = 0; index < waypoints.length; index += 1) {
    const position = waypoints[index]?.waypoint_index;
    if (!Number.isInteger(position) || position < 0 || position >= list.length) return fallback;
    // Índice repetido deixaria um buraco no array e sumiria com um ponto do dia.
    if (ordered[position]) return fallback;
    ordered[position] = list[index];
  }
  if (ordered.some((point) => !point)) return fallback;

  return { points: ordered, optimized: true };
};

/**
 * Geometria da rota real que liga os pontos, na ordem recebida.
 *
 * `overview=full` para a linha não sair simplificada — no zoom de rua uma rota
 * genérica denunciaria que a curva não é a da via.
 *
 * Dias com mais de 25 pontos são divididos em trechos que COMPARTILHAM o ponto
 * de emenda, senão a rota sairia com um buraco exatamente na junção. Um trecho
 * que falha derruba a rota inteira: meia rota desenhada é pior que nenhuma,
 * porque parece um trajeto completo que simplesmente ignora metade do dia.
 *
 * @param {Array<{latitude:number, longitude:number}>} points
 * @param {{ signal?: AbortSignal, profile?: string }} [options]
 * @returns {Promise<Array<[number, number]> | null>} coordenadas ou null
 */
export const fetchRouteGeometry = async (points, options = {}) => {
  const list = points ?? [];
  if (!token()) return null;
  if (list.length < MIN_COORDINATES) return null;

  const { signal, profile = DEFAULT_ROUTING_PROFILE } = options;
  const coordinates = [];

  for (let start = 0; start < list.length - 1; start += DIRECTIONS_MAX_COORDINATES - 1) {
    const chunk = list.slice(start, start + DIRECTIONS_MAX_COORDINATES);
    if (chunk.length < MIN_COORDINATES) break;

    const url =
      `${MAPBOX_ORIGIN}/directions/v5/mapbox/${profile}/${toCoordinatePath(chunk)}`
      + `?geometries=geojson&overview=full&access_token=${token()}`;

    const body = await getJson(url, signal);
    const leg = body?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(leg) || leg.length < MIN_COORDINATES) return null;

    // O primeiro par do trecho seguinte é o último do anterior: entra uma vez só.
    coordinates.push(...(coordinates.length ? leg.slice(1) : leg));
  }

  return coordinates.length >= MIN_COORDINATES ? coordinates : null;
};

/**
 * Agrupa os pontos por dia preservando a ordem que a IA deu.
 *
 * @param {Array<{day?:number}>} points
 * @returns {Map<number, Array<any>>}
 */
export const groupPointsByDay = (points) => {
  const byDay = new Map();
  for (const point of points ?? []) {
    const day = Number(point?.day) || 1;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(point);
  }
  return byDay;
};

/**
 * Otimiza e traça todos os dias do roteiro.
 *
 * Os dias correm EM SÉRIE, de propósito. Um roteiro de duas semanas dispararia
 * 28 requisições de uma vez, e o teto da Optimization é 300 por minuto por
 * conta — não por usuário. Em série, um roteiro longo se espalha no tempo em vez
 * de gastar a cota de todo mundo num pico. O mapa já está desenhado com a ordem
 * da IA enquanto isso acontece; cada dia que volta é uma melhora incremental,
 * comunicada pelo `onDay`.
 *
 * @param {Array<any>} points pontos achatados de getPlanPoints
 * @param {{ signal?: AbortSignal, profile?: string,
 *   onDay?: (day: number, result: any) => void }} [options]
 * @returns {Promise<Map<number, { points: Array<any>, coordinates: Array<any>|null,
 *   optimized: boolean, routed: boolean }>>}
 */
export const buildPlanRoutes = async (points, options = {}) => {
  const { signal, profile = DEFAULT_ROUTING_PROFILE, onDay } = options;
  const byDay = groupPointsByDay(points);
  const routes = new Map();

  for (const [day, dayPoints] of byDay) {
    if (signal?.aborted) break;

    const { points: ordered, optimized } = await optimizePointOrder(dayPoints, { signal, profile });
    const coordinates = await fetchRouteGeometry(ordered, { signal, profile });

    const result = { points: ordered, coordinates, optimized, routed: Boolean(coordinates) };
    routes.set(day, result);
    onDay?.(day, result);
  }

  return routes;
};
