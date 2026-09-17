// Lugares em volta de uma parada do roteiro, pela Search Box API do Mapbox
// (busca por categoria).
//
// https://docs.mapbox.com/api/search/search-box/#category-search
//
// POR QUE BUSCA POR CATEGORIA, E NÃO POR TEXTO: a pergunta do usuário não é "onde
// fica o Fórum Romano", é "o que tem por perto". Quem pergunta isso não tem um
// nome para digitar. A busca por categoria devolve exatamente o formato da
// pergunta — restaurantes, museus, parques dentro de um raio — em UMA requisição
// para todas as categorias de uma vez.
//
// REGRA DA CASA, a mesma de mapboxIsochrone.js e mapboxRouting.js: nada aqui
// lança. A falha volta como `null` e a tela segue como estava. Esta é uma camada
// opcional sobre um mapa que já funciona.
//
// `null` e `[]` NÃO são a mesma coisa, e é de propósito: `null` é "não deu para
// buscar" (token ausente, 403, timeout) e `[]` é "a busca funcionou e não há
// nada por perto". A folha diz coisas diferentes nos dois casos.
//
// O módulo não importa nada de mapa nem de React: recebe um ponto, devolve uma
// lista de lugares. É o que permite exercitá-lo com um `fetch` falso no teste.
import { API_CONFIG } from '../utils/constants';
import { normalizeCategory } from '../utils/planGeography';

const MAPBOX_ORIGIN = 'https://api.mapbox.com';

// O pedido sai sob toque direto: o usuário tocou na parada e está olhando para a
// folha. Mesmo teto da isócrona, que viaja junto com este pedido — de nada
// adiantaria esperar mais por uma das duas metades.
const REQUEST_TIMEOUT_MS = 6000;

/** Teto da própria API para busca por categoria. */
const MAX_LIMIT = 25;

/**
 * As categorias canônicas que perguntamos ao Mapbox, e como cada uma volta para
 * o vocabulário do app.
 *
 * O enum do app tem oito valores (planGeography.PLACE_CATEGORIES) e a Search Box
 * tem centenas de categorias canônicas. Esta tabela é a tradução, e ela é curta
 * DE PROPÓSITO: cada categoria a mais é mais ruído na folha, e a folha só tem
 * espaço para meia dúzia de linhas. São as sete coisas que alguém procura num
 * raio de quinze minutos a pé.
 */
export const CANONICAL_CATEGORIES = {
  restaurant: 'restaurante',
  cafe: 'restaurante',
  tourist_attraction: 'atracao',
  museum: 'atracao',
  park: 'natureza',
  shopping: 'compras',
  bar: 'vida_noturna',
};

/** Nome que a categoria recebe na folha. Português, como todo rótulo do app. */
export const CATEGORY_LABEL = {
  restaurante: 'Restaurante',
  atracao: 'Ponto turístico',
  compras: 'Compras',
  hotel: 'Hospedagem',
  transporte: 'Transporte',
  natureza: 'Natureza',
  vida_noturna: 'Vida noturna',
  outro: 'Lugar',
};

const token = () => API_CONFIG.MAPBOX_TOKEN;

/**
 * Coordenada como número, ou NaN.
 *
 * O `typeof` antes do `Number` não é zelo: `Number(null)` é 0, um valor
 * perfeitamente finito, e uma parada sem coordenada buscaria lugares no golfo da
 * Guiné — em silêncio, porque a API responde 200 para uma coordenada válida no
 * oceano. Mesma guarda de mapboxIsochrone.js.
 */
const asCoordinate = (value) => (typeof value === 'number' ? value : Number.NaN);

const toProximity = (point) => {
  const longitude = asCoordinate(point?.longitude);
  const latitude = asCoordinate(point?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;
  return `${longitude},${latitude}`;
};

/**
 * A categoria do app para um lugar que a API devolveu.
 *
 * A resposta traz uma lista de categorias canônicas (um bar pode ser
 * `bar,restaurant,nightlife`). Vale a primeira que este app sabe nomear; se
 * nenhuma for conhecida, o nome do lugar ainda pode denunciar a categoria — e é
 * exatamente isso que `normalizeCategory` já faz pelos roteiros antigos, então
 * ela é reaproveitada em vez de reescrita aqui.
 */
export const resolveCategory = (properties) => {
  const canonical = Array.isArray(properties?.poi_category_ids)
    ? properties.poi_category_ids
    : [];

  for (const id of canonical) {
    const mapped = CANONICAL_CATEGORIES[String(id).toLowerCase()];
    if (mapped) return mapped;
  }

  const readable = Array.isArray(properties?.poi_category)
    ? properties.poi_category.join(' ')
    : '';
  return normalizeCategory(readable, properties?.name || '');
};

/**
 * O nome do estabelecimento, como ele se chama de verdade.
 *
 * NOMES PRÓPRIOS NÃO SE TRADUZEM. A requisição pede `language=pt` — e continua
 * pedindo, porque é isso que traz categoria e endereço em português — mas esse
 * parâmetro também faz a API devolver, em `name`, uma versão localizada quando
 * ela existe. Para um estabelecimento isso é um problema: quem está procurando a
 * placa na rua precisa do nome da placa, não de uma tradução dele.
 *
 * `name_preferred` é o nome canônico do lugar, e a API só o manda quando ele
 * difere do `name` — ou seja, exatamente nos casos em que a localização mexeu
 * no nome. Por isso ele vem primeiro, com `name` como reserva.
 */
const placeName = (properties) => {
  const preferred = properties?.name_preferred;
  if (typeof preferred === 'string' && preferred.trim()) return preferred.trim();

  const name = properties?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : '';
};

/**
 * Um lugar da resposta vira o objeto que a folha entende, ou `null`.
 *
 * Sem nome não entra: uma linha em branco na lista não ajuda ninguém a decidir
 * para onde andar.
 */
const toPlace = (feature) => {
  const coordinates = feature?.geometry?.coordinates;
  const longitude = asCoordinate(coordinates?.[0]);
  const latitude = asCoordinate(coordinates?.[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  const name = placeName(feature?.properties);
  if (!name) return null;

  return {
    id: feature?.properties?.mapbox_id || `${longitude},${latitude}`,
    name,
    category: resolveCategory(feature?.properties),
    longitude,
    latitude,
  };
};

/**
 * Lugares em volta de um ponto.
 *
 * @param {{ latitude: number, longitude: number }} point
 * @param {{
 *   limit?: number,
 *   bbox?: [number, number, number, number] | null,
 *   signal?: AbortSignal,
 * }} [options] `bbox` recorta a busca à área desenhada no mapa — sem ele a API
 *   devolve o que estiver perto, inclusive do outro lado do rio
 * @returns {Promise<Array<{id:string,name:string,category:string,longitude:number,latitude:number}> | null>}
 */
export const fetchNearbyPlaces = async (point, options = {}) => {
  if (!token()) return null;

  const proximity = toProximity(point);
  if (!proximity) return null;

  const { limit = MAX_LIMIT, bbox, signal } = options;

  const canonical = Object.keys(CANONICAL_CATEGORIES).join(',');
  const parameters = new URLSearchParams({
    proximity,
    limit: String(Math.min(Math.max(1, Math.round(limit)), MAX_LIMIT)),
    language: 'pt',
    access_token: token(),
  });

  // Quatro números finitos ou nada: um bbox malformado é 422 depois de uma ida à
  // rede à toa.
  if (Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isFinite)) {
    parameters.set('bbox', bbox.join(','));
  }

  const url =
    `${MAPBOX_ORIGIN}/search/searchbox/v1/category/${encodeURIComponent(canonical)}`
    + `?${parameters.toString()}`;

  // AbortSignal.any junta o cancelamento de quem chamou (folha fechada, outra
  // parada tocada) com o do timeout. Onde ele não existir, o timeout ainda vale
  // sozinho — mesma escada de mapboxIsochrone.js.
  const timeout = AbortSignal.timeout?.(REQUEST_TIMEOUT_MS);
  const combined =
    signal && timeout && AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout || signal;

  try {
    const response = await fetch(url, { signal: combined });
    if (!response.ok) return null;

    const body = await response.json();
    if (!Array.isArray(body?.features)) return null;

    return body.features.map(toPlace).filter(Boolean);
  } catch {
    // Inclui o AbortError do timeout e do cancelamento. Do ponto de vista de
    // quem desenha a folha, um pedido cancelado não é diferente de um que falhou.
    return null;
  }
};
