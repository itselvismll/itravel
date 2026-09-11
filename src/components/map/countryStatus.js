// Status de cada país no globo e o que ele significa para o badge.
//
// O globo mostra o mundo inteiro, não só onde a pessoa foi: todo país com código
// ISO ganha badge. O que muda entre visitado, wishlist e não marcado é o ESTILO
// e a prioridade na disputa por espaço — nunca a presença do badge.
//
// Módulo puro: sem DOM, sem MapLibre, sem react-native.
import { getAlpha3, UK_NATION_CODES } from '../../utils/countryUtils';
import { EXPANDED, COMPACT } from './badgeCollision';

export const VISITED = 'visited';
export const WISHLIST = 'wishlist';
export const UNMARKED = 'unmarked';

// Quem é convidado a mostrar o nome escrito. País não marcado fica sempre no
// pill: são ~200 deles, e abrir o nome de todos transformaria o globo numa
// parede de texto — além de roubar o espaço de quem a pessoa realmente marcou.
const EXPANDABLE = { [VISITED]: true, [WISHLIST]: true, [UNMARKED]: false };

const RANK = { [VISITED]: 2, [WISHLIST]: 1, [UNMARKED]: 0 };

/**
 * O badge deste país pode chegar a mostrar o nome?
 *
 * `allowUnmarked` é o nível de país do filtro de zoom (ver featuredCountries.js):
 * de tão perto sobra espaço e a regra "só marcado abre o nome" se inverte — uma
 * tela cheia de pills sem nome não diz nada. Quem decide quantos realmente abrem
 * continua sendo a colisão.
 *
 * @param {{ status?: string }} country
 * @param {{ allowUnmarked?: boolean }} [options]
 */
export const isExpandable = (country, { allowUnmarked = false } = {}) =>
  allowUnmarked || (EXPANDABLE[country?.status] ?? false);

/**
 * Prioridade na disputa por espaço, do mais forte para o mais fraco.
 *
 * Visitado ganha de wishlist, que ganha de não marcado; dentro do mesmo status,
 * país maior fica com o nome. A área vem em esterradianos e a esfera inteira tem
 * ~12,57, então o multiplicador de 100 garante que o status sempre domine e a
 * área só desempate.
 *
 * Não depende da câmera de propósito: prioridade que muda com o zoom faria os
 * badges trocarem de estado sozinhos durante um arrasto.
 *
 * @param {{ status?: string, area?: number }} country
 */
export const badgePriority = (country) =>
  (RANK[country?.status] ?? 0) * 100 + (country?.area ?? 0);

/**
 * O estado em que o badge é realmente DESENHADO.
 *
 * A colisão devolve o que cabe, e para um país não marcado ela pode dizer
 * "expandido" — afinal ele entra na disputa já com a largura de um pill, então
 * quase sempre cabe. Quem não pode abrir o nome fica no pill de qualquer jeito.
 *
 * Uma função só para medir, renderizar e empilhar, senão as três discordam.
 *
 * @param {{ status?: string }} country
 * @param {string} [mode] estado devolvido por resolveBadgeModes
 * @param {{ allowUnmarked?: boolean }} [options] ver isExpandable
 * @returns {'expanded' | 'compact'}
 */
export const renderedBadgeMode = (country, mode, options) => {
  if (!isExpandable(country, options)) return COMPACT;
  // Sem estado conhecido o badge nasce expandido — é o que garante que a largura
  // escrita de todo país marcado seja medida ao menos uma vez.
  return mode === COMPACT ? COMPACT : EXPANDED;
};

// As 4 nações do Reino Unido, que o app trata como países independentes.
//
// A lista desceu para utils/countryUtils, porque `toStorableCountryCode` precisa
// dela para decidir o que é código válido e não pode importar deste módulo (daria
// ciclo: countryStatus já importa countryUtils). Reexportada aqui para quem já
// importava daqui continuar funcionando.
export { UK_NATION_CODES };

/**
 * Quem marcou "Reino Unido" continua com o Reino Unido pintado.
 *
 * O mapa não tem mais um polígono GBR — ele virou as 4 nações (ver
 * geoService.withUkNations). Sem esta expansão, uma pessoa que marcou GBR antes
 * da mudança abriria o globo e veria a ilha inteira apagada, como se a viagem
 * tivesse sumido. Expandir para as 4 mantém o mapa igual ao que ela deixou.
 *
 * Só vale para a EXIBIÇÃO: o banco continua com o GBR que ela salvou, e marcar
 * ou desmarcar uma nação a partir de agora é por nação.
 *
 * @param {Set<string>} codes
 * @returns {Set<string>}
 */
export const expandUkNations = (codes) => {
  if (!codes?.has('GBR')) return codes ?? new Set();

  const expanded = new Set(codes);
  for (const code of UK_NATION_CODES) expanded.add(code);
  return expanded;
};

/**
 * Normaliza uma lista de códigos vinda do banco para alpha-3.
 *
 * `visited_countries` e `wishlist` guardam ora alpha-2, ora alpha-3, dependendo
 * de por onde o país foi marcado. As âncoras são todas alpha-3, então sem
 * normalizar um país visitado apareceria como não marcado.
 *
 * @param {Array<{ country_code?: string } | string>} rows
 * @returns {Set<string>}
 */
export const toAlpha3Set = (rows) => {
  const codes = new Set();
  for (const row of rows ?? []) {
    const raw = typeof row === 'string' ? row : row?.country_code;
    const alpha3 = raw ? getAlpha3(raw) : null;
    if (alpha3) codes.add(alpha3.toUpperCase());
  }
  return codes;
};

/**
 * O status de um país a partir dos conjuntos do usuário.
 *
 * Visitado vence wishlist: já foi, então "quero ir" virou histórico. É a mesma
 * precedência do badge e do território pintado, e mora aqui para os dois
 * caminhos que montam a lista — o do web, via buildGlobeCountries, e o do
 * nativo, que recebe as âncoras prontas da WebView e só precisa do status —
 * não poderem discordar.
 *
 * @param {string} code alpha-3
 * @param {Set<string>} [visited]
 * @param {Set<string>} [wishlist]
 * @returns {string} VISITED | WISHLIST | UNMARKED
 */
export const statusOf = (code, visited, wishlist) => {
  if (visited?.has(code)) return VISITED;
  if (wishlist?.has(code)) return WISHLIST;
  return UNMARKED;
};

/**
 * Monta a lista de badges do globo: TODAS as âncoras, cada uma com seu status.
 *
 * Países sem código ISO no GeoJSON (Kosovo, Somalilândia, bases militares…) não
 * chegam aqui — buildCountryAnchors já os descarta, porque sem código não há
 * bandeira nem como marcá-los como visitados.
 *
 * @param {Record<string, { lng: number, lat: number, area: number }>} anchors
 * @param {{
 *   visited?: Set<string>,
 *   wishlist?: Set<string>,
 *   nameOf: (code: string) => string,
 * }} options
 * @returns {Array<{ code: string, name: string, lat: number, lng: number, area: number, status: string }>}
 */
export const buildGlobeCountries = (anchors, { visited, wishlist, nameOf }) => {
  const visitedCodes = visited ?? new Set();
  const wishlistCodes = wishlist ?? new Set();

  return Object.entries(anchors ?? {}).map(([code, anchor]) => ({
    code,
    name: nameOf(code),
    lat: anchor.lat,
    lng: anchor.lng,
    area: anchor.area,
    status: statusOf(code, visitedCodes, wishlistCodes),
  }));
};
