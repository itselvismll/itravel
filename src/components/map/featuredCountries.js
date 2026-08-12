// Quais países ganham badge em cada nível de zoom.
//
// O globo tem badge para os 238 países com código ISO. Mostrar todos de uma vez
// no zoom de globo é ilegível — vira uma parede de bandeiras que esconde o
// próprio planeta. Então a exibição é progressiva: quanto mais perto a câmera
// chega, mais países entram em cena.
//
// - globo inteiro (0–2)   -> só os destaques globais (25) e os países do usuário
// - continente  (2–3,5)   -> + os principais de cada continente (tier 2)
// - sub-região  (3,5–5)   -> todos os países do viewport, inclusive os menores
// - país        (5+)      -> todos, e agora qualquer um pode abrir o nome
//
// Os dois últimos níveis usam o mesmo conjunto de países de propósito: é o
// viewport que faz a diferença entre eles, encolhendo conforme o zoom sobe. O
// que muda no último é a LEITURA — de tão perto sobra espaço, e segurar todo
// mundo em pill viraria um campo de bandeiras sem nome.
//
// Quem separa os que sobram em cada nível continua sendo a colisão
// (badgeCollision.js), que colapsa para pill quem não cabe escrito.
//
// Módulo puro: sem DOM, sem MapLibre, sem react-native.
import { VISITED, WISHLIST } from './countryStatus';

// Zoom a partir do qual saímos do "globo inteiro" e o tier 2 entra em cena.
// Abaixo disso a Terra inteira (ou quase) cabe na tela.
export const CONTINENT_ZOOM = 2;

// Zoom a partir do qual TODO país do viewport aparece, incluindo os menores.
export const SUBREGION_ZOOM = 3.5;

// Zoom a partir do qual qualquer badge pode mostrar o nome, marcado ou não.
export const COUNTRY_ZOOM = 5;

/**
 * Os ~25 países de destaque do zoom de globo.
 *
 * Um por região, escolhidos por serem grandes e reconhecíveis de longe: no globo
 * inteiro o que importa é dar âncoras de leitura ("isto aqui é a América do
 * Sul"), não catalogar o mundo. Códigos ISO alpha-3, que é o padrão das âncoras
 * (ver countryStatus.js).
 *
 * Esta lista existe para ser ajustada — mexer aqui é a forma suportada de mudar
 * o que aparece no zoom mais aberto.
 */
export const FEATURED_COUNTRY_CODES = [
  // Américas
  'BRA',
  'USA',
  'CAN',
  'MEX',
  'ARG',
  'PER',
  'COL',
  // Europa
  'FRA',
  'DEU',
  'UKR',
  // África
  'ZAF',
  'NGA',
  'EGY',
  'ETH',
  'TZA',
  // Ásia
  'RUS',
  'CHN',
  'IND',
  'JPN',
  'IDN',
  'SAU',
  'TUR',
  'PAK',
  'KAZ',
  // Oceania
  'AUS',
];

const FEATURED = new Set(FEATURED_COUNTRY_CODES);

/**
 * Tier 2: os principais de cada continente, por continente.
 *
 * Entram no nível intermediário — quando a câmera já está dentro de um
 * continente, mas ainda longe o bastante para que abrir os ~55 países da África
 * ou os ~45 da Europa de uma vez seja um salto de poucos para muitos. É o degrau
 * que faltava entre "25 no mundo" e "tudo".
 *
 * Os destaques globais NÃO se repetem aqui: eles já passaram no nível anterior e
 * continuam passando. A lista é só o que o tier 2 ACRESCENTA — por isso a
 * América do Sul aparece sem Brasil e Argentina.
 *
 * Critério: tamanho na tela e reconhecimento. Um país que ninguém identifica de
 * longe não ajuda a orientar, só ocupa espaço que a colisão vai ter de resolver.
 * Agrupado por continente para ser fácil de ajustar uma região sem mexer nas
 * outras.
 */
export const REGIONAL_COUNTRY_CODES = {
  // Sem BRA e ARG (destaques globais). Suriname, Guiana e Paraguai ficam para o
  // nível de sub-região: são pequenos ou pouco reconhecíveis a essa distância.
  southAmerica: ['CHL', 'VEN', 'BOL', 'ECU', 'URY'],
  // Sem USA, CAN e MEX.
  northAmerica: ['CUB', 'GTM', 'PAN', 'CRI', 'DOM'],
  // Sem FRA, DEU e UKR. O continente mais denso do mapa: a lista é curta de
  // propósito, senão o nível intermediário já chega saturado.
  europe: ['GBR', 'ESP', 'ITA', 'POL', 'ROU', 'SWE', 'NOR', 'FIN', 'PRT', 'GRC', 'NLD', 'CHE'],
  // Sem ZAF, NGA, EGY, ETH e TZA.
  africa: [
    'COD',
    'DZA',
    'LBY',
    'SDN',
    'MLI',
    'NER',
    'TCD',
    'AGO',
    'MOZ',
    'KEN',
    'MAR',
    'GHA',
    'CMR',
    'MDG',
    'TUN',
  ],
  // Sem RUS, CHN, IND, JPN, IDN, SAU, TUR, PAK e KAZ.
  asia: [
    'IRN',
    'THA',
    'VNM',
    'MMR',
    'MYS',
    'PHL',
    'KOR',
    'AFG',
    'IRQ',
    'UZB',
    'MNG',
    'BGD',
    'ISR',
    'ARE',
  ],
  // Sem AUS.
  oceania: ['NZL', 'PNG', 'FJI'],
};

const REGIONAL = new Set(Object.values(REGIONAL_COUNTRY_CODES).flat());

/**
 * Este país é um dos destaques do zoom de globo?
 * @param {string} code código ISO alpha-3
 */
export const isFeatured = (code) => FEATURED.has(String(code ?? '').toUpperCase());

/**
 * Este país é um dos principais do continente dele (tier 2)?
 * @param {string} code código ISO alpha-3
 */
export const isRegional = (code) => REGIONAL.has(String(code ?? '').toUpperCase());

/**
 * Um país do usuário nunca é escondido pelo filtro de zoom.
 *
 * Visitado e wishlist são o conteúdo que a pessoa criou; some por estar fora da
 * tela ou atrás do globo, nunca por não estar numa lista curada.
 *
 * @param {{ status?: string }} country
 */
export const isUserCountry = (country) =>
  country?.status === VISITED || country?.status === WISHLIST;

/**
 * O filtro de zoom deixa este país passar?
 *
 * Só decide a parte que depende do zoom — estar dentro do viewport e à frente do
 * globo é checado por quem tem a câmera na mão (CountryBadgeMarkers). É o
 * viewport, aliás, que transforma "os principais do continente" numa regra de
 * continente: no zoom 2–3,5 só um continente cabe na tela, então filtrar por
 * tier 2 global e por viewport dá o mesmo resultado que uma tabela de qual país
 * pertence a qual continente — sem precisar manter essa tabela.
 *
 * @param {{ code?: string, status?: string }} country
 * @param {number} zoom zoom atual do mapa
 * @returns {boolean}
 */
export const passesZoomFilter = (country, zoom) => {
  // O que a pessoa marcou nunca depende de curadoria nossa.
  if (isUserCountry(country)) return true;

  const level = Number.isFinite(zoom) ? zoom : 0;

  if (level >= SUBREGION_ZOOM) return true;
  if (level >= CONTINENT_ZOOM) return isFeatured(country?.code) || isRegional(country?.code);
  return isFeatured(country?.code);
};

/**
 * Neste zoom, qualquer país pode abrir o nome?
 *
 * Fora do nível de país só visitado e wishlist mostram o nome escrito (ver
 * countryStatus.js) — são ~200 não marcados, e abrir todos seria uma parede de
 * texto. De perto o problema se inverte: sobra espaço, e uma tela de pills sem
 * nome não diz nada. A colisão continua mandando em quem realmente cabe.
 *
 * @param {number} zoom zoom atual do mapa
 */
export const expandsEveryBadge = (zoom) => Number.isFinite(zoom) && zoom >= COUNTRY_ZOOM;
