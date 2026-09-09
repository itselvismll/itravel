// "O que tem por perto": a área alcançável a pé a partir de um ponto do roteiro,
// pela Isochrone API do Mapbox.
//
// https://docs.mapbox.com/api/navigation/isochrone/
//
// Uma isócrona não é um círculo. O raio de 15 minutos a pé segue a malha real de
// ruas — encolhe onde há rio, morro ou via sem travessia, e estica ao longo de
// um calçadão. É exatamente essa diferença que responde a pergunta do usuário; um
// círculo desenhado por nós seria mais bonito e mais errado.
//
// REGRA DA CASA, a mesma de mapboxRouting.js: nada aqui lança. A falha volta como
// `null` e a tela segue como estava — sem área desenhada, com o roteiro intacto.
// Esta é uma camada opcional sobre um mapa que já funciona; ela não tem direito
// de derrubar nada.
//
// O módulo não importa nada de mapa nem de React: recebe um ponto, devolve
// GeoJSON. É o que permite exercitá-lo com um `fetch` falso no teste.
import { API_CONFIG } from '../utils/constants';

const MAPBOX_ORIGIN = 'https://api.mapbox.com';

/** Perfil a pé: a pergunta é "o que dá para fazer sem pegar transporte". */
export const DEFAULT_ISOCHRONE_PROFILE = 'walking';

/** Raio padrão em minutos. Quinze minutos a pé é a distância que as pessoas
 * realmente andam entre uma parada e outra sem sentir que se deslocaram. */
export const DEFAULT_ISOCHRONE_MINUTES = 15;

/** Teto da própria API, não escolha nossa: `contours_minutes` vai até 60. */
export const MAX_ISOCHRONE_MINUTES = 60;

// A isócrona é pedida sob toque direto do usuário, que fica olhando para o
// popup esperando. Um teto mais curto que o do roteiro: passado isso, o aviso
// discreto é melhor resposta do que o cursor girando.
const REQUEST_TIMEOUT_MS = 6000;

// `denoise=1` descarta as ilhas soltas que a API devolve quando um trecho de rua
// desconexo cai dentro do tempo — no mapa elas aparecem como manchas órfãs longe
// do pino, que o usuário lê como erro de desenho.
const DENOISE = 1;

// Suaviza o contorno. Sem isso o polígono sai com o serrilhado da malha viária,
// que compete visualmente com a linha da rota.
const GENERALIZE_METERS = 20;

const token = () => API_CONFIG.MAPBOX_TOKEN;

/**
 * Coordenada como número, ou NaN.
 *
 * O `typeof` antes do `Number` não é zelo: `Number(null)` e `Number('')` são 0,
 * um valor perfeitamente finito. Sem esta guarda, um ponto que chegou da IA com
 * `latitude: null` viraria a linha do Equador e a área sairia desenhada no golfo
 * da Guiné — em silêncio, porque a API responde 200 para uma coordenada válida
 * no oceano.
 */
const asCoordinate = (value) => (typeof value === 'number' ? value : Number.NaN);

/**
 * Ponto virou par de coordenadas válido?
 *
 * Vale a checagem: um ponto do roteiro pode ter chegado da IA sem coordenada, e
 * `undefined,undefined` na URL volta 422 depois de uma ida à rede à toa.
 */
const toCoordinatePair = (point) => {
  const longitude = asCoordinate(point?.longitude);
  const latitude = asCoordinate(point?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return `${longitude},${latitude}`;
};

/**
 * Minutos aceitos pela API, ou `null` quando o pedido é impossível.
 *
 * Recortar silenciosamente para o teto mentiria: quem pediu 90 minutos veria uma
 * área de 60 sem saber. Um pedido fora da faixa é um erro de quem chamou.
 */
const normalizeMinutes = (minutes) => {
  const value = Math.round(Number(minutes));
  if (!Number.isInteger(value) || value < 1 || value > MAX_ISOCHRONE_MINUTES) return null;
  return value;
};

/**
 * A Isochrone devolve um FeatureCollection de polígonos — um por contorno
 * pedido. Pedimos um só, então o que interessa é o primeiro.
 *
 * Ao contrário da Directions e da Optimization, esta API NÃO carimba `code: 'Ok'`
 * no corpo de sucesso: a resposta boa é o próprio GeoJSON. Por isso o
 * `getJson` de mapboxRouting.js não serve aqui — reaproveitá-lo faria toda
 * resposta válida ser tratada como falha.
 */
const firstPolygon = (body) => {
  const feature = body?.features?.[0];
  const type = feature?.geometry?.type;
  if (type !== 'Polygon' && type !== 'MultiPolygon') return null;
  if (!Array.isArray(feature.geometry.coordinates) || !feature.geometry.coordinates.length) {
    return null;
  }
  return feature;
};

/**
 * Área alcançável a pé a partir de um ponto do roteiro.
 *
 * Devolve uma Feature de polígono pronta para virar source do mapa, ou `null`.
 * O `null` é o único canal de erro: quem chama não precisa distinguir 403 de
 * timeout de resposta vazia, porque a reação é a mesma nos três casos — não
 * desenhar nada e avisar discretamente.
 *
 * @param {{ latitude: number, longitude: number }} point
 * @param {{ minutes?: number, profile?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<any | null>} Feature GeoJSON com `properties.minutes`, ou null
 */
export const fetchIsochrone = async (point, options = {}) => {
  if (!token()) return null;

  const coordinates = toCoordinatePair(point);
  if (!coordinates) return null;

  const {
    minutes = DEFAULT_ISOCHRONE_MINUTES,
    profile = DEFAULT_ISOCHRONE_PROFILE,
    signal,
  } = options;

  const contour = normalizeMinutes(minutes);
  if (contour === null) return null;

  const url =
    `${MAPBOX_ORIGIN}/isochrone/v1/mapbox/${profile}/${encodeURIComponent(coordinates)}`
    + `?contours_minutes=${contour}&polygons=true&denoise=${DENOISE}`
    + `&generalize=${GENERALIZE_METERS}&access_token=${token()}`;

  // AbortSignal.any junta o cancelamento do chamador (popup fechou, componente
  // desmontou) com o do timeout. Onde ele não existir, o timeout ainda vale
  // sozinho — mesma escada de mapboxRouting.js.
  const timeout = AbortSignal.timeout?.(REQUEST_TIMEOUT_MS);
  const combined =
    signal && timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout || signal;

  try {
    const response = await fetch(url, { signal: combined });
    if (!response.ok) return null;

    const feature = firstPolygon(await response.json());
    if (!feature) return null;

    // As properties que a API manda descrevem o contorno em unidades dela
    // (`contour`, `color`, `opacity`). Trocamos por `minutes`, que é o que a
    // camada e o rótulo do mapa precisam, e mantemos o perfil para o dia em que
    // houver mais de um.
    return {
      type: 'Feature',
      geometry: feature.geometry,
      properties: { minutes: contour, profile },
    };
  } catch {
    // Inclui o AbortError do timeout e do cancelamento. Um pedido cancelado não
    // é diferente de um que falhou, do ponto de vista de quem desenha: nos dois
    // casos não há polígono.
    return null;
  }
};
