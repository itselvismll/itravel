// Traduz os rótulos do mapa para o idioma do app.
//
// O schema OpenMapTiles traz um campo `name:<idioma>` por
// feature, mas as styles vêm montadas em cima de `name:latin` + `name:nonlatin`
// — daí "RUSSIA / РОССИЯ" em duas linhas. O campo `name:pt` existe e
// está bem preenchido para países, cidades, água e POIs.
//
// Em vez de reescrever cada text-field na mão (a style tem ~24 symbol layers com
// 4 formatos diferentes de expressão), caminhamos a expressão recursivamente e
// trocamos só as referências a nome. Assim continua funcionando se o provedor
// mexer na style, e detalhes como a altitude dos picos (`... "\n" ele " m"`)
// sobrevivem intactos.
//
// Módulo sem dependência de react-native de propósito (countryUtils também é
// puro): roda no browser e é exercitado direto nos testes. O idioma entra como
// PARÂMETRO, nunca lido de um contexto — é o que mantém isso verdadeiro.
//
// FASE 2 DO IDIOMA: `getCountryName` (countryUtils) agora recebe a tag de
// locale e usa `Intl.DisplayNames` no idioma pedido, então a sobreposição vale
// para os três idiomas — não só português.

import { ALPHA3_TO_ALPHA2, getCountryName } from '../../utils/countryUtils';

/**
 * A cadeia de nomes vinda do tile, na ordem de preferência.
 *
 * `name:<idioma>` primeiro; `name:latin` e `name` como rede, porque o campo do
 * idioma não está preenchido em toda feature — e um rótulo em qualquer idioma é
 * melhor do que nenhum rótulo.
 *
 * @param {string} mapNameField o campo do tileset ('name:pt', 'name:en', …)
 */
const nameFromTile = (mapNameField) => [
  'coalesce',
  ['get', mapNameField],
  ['get', 'name:latin'],
  ['get', 'name'],
];

// O `name:pt` do OpenMapTiles é português europeu: vem "Quénia", "Seri-Lanca",
// "Moscovo". Num app brasileiro isso lê como bug — e o mesmo tile tem o problema
// equivalente em outros idiomas às vezes. Para PAÍS dá para fazer melhor: a
// feature carrega `iso_a2`, e o app sabe o nome de cada código no idioma ativo
// por getCountryName (Intl.DisplayNames). Assim o rótulo no mapa bate
// exatamente com o nome usado no badge, na busca e no modal — em vez de duas
// grafias no mesmo app.
//
// Cidades e água continuam vindo do tile (não têm código ISO para cruzar).
const buildCountryNameMatch = (locale, mapNameField) => {
  const fromTile = nameFromTile(mapNameField);
  const tag = MAP_LOCALE_TAG[locale];
  if (!tag) return fromTile;

  const pairs = [];
  for (const alpha2 of new Set(Object.values(ALPHA3_TO_ALPHA2))) {
    const name = getCountryName(alpha2, '', tag);
    if (name && name !== alpha2) pairs.push(alpha2, name);
  }
  // `match` precisa de pelo menos um par; sem nomes resolvidos, cai no tile.
  if (pairs.length === 0) return fromTile;

  return [
    'case',
    ['has', 'iso_a2'],
    ['match', ['get', 'iso_a2'], ...pairs, fromTile],
    fromTile,
  ];
};

/** O idioma dos rótulos quando quem chama não diz. */
export const DEFAULT_MAP_LOCALE = 'pt';

/** O campo do tileset de cada idioma. Espelha `SUPPORTED_LOCALES` em src/i18n. */
const MAP_NAME_FIELD = { pt: 'name:pt', en: 'name:en', es: 'name:es' };

/** A tag de `Intl` de cada idioma do mapa. Espelha `SUPPORTED_LOCALES` em src/i18n. */
const MAP_LOCALE_TAG = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

/**
 * A expressão de nome de um idioma.
 *
 * Memoizada por idioma porque montar o `match` de país percorre ~250 códigos, e
 * isto é chamado uma vez por symbol layer (~24 por style).
 */
const nameExpressionCache = new Map();

const nameExpressionFor = (locale) => {
  const code = MAP_NAME_FIELD[locale] ? locale : DEFAULT_MAP_LOCALE;
  if (!nameExpressionCache.has(code)) {
    nameExpressionCache.set(code, buildCountryNameMatch(code, MAP_NAME_FIELD[code]));
  }
  return nameExpressionCache.get(code);
};

// Tokens no formato antigo de string ("{name:latin}").
const NAME_TOKEN_PATTERN = /^\{name(:latin)?\}$/;

const isGetOf = (node, key) =>
  Array.isArray(node) && node.length === 2 && node[0] === 'get' && node[1] === key;

const isHasOf = (node, key) =>
  Array.isArray(node) && node.length === 2 && node[0] === 'has' && node[1] === key;

/**
 * Reescreve uma expressão de text-field para usar o nome no idioma pedido.
 *
 * Duas substituições:
 * 1. `["get","name:latin"]` e `["get","name"]` viram o coalesce com `name:<idioma>`.
 * 2. `["has","name:nonlatin"]` vira `false`, o que faz o ramo que concatena o
 *    nome em escrita nativa cair fora sozinho — sem sobrar "\n" solto, que é o
 *    que aconteceria se trocássemos só o `get` por string vazia.
 *
 * @param {unknown} node
 * @param {string} [locale] 'pt' | 'en' | 'es'; idioma desconhecido cai em 'pt'
 */
export const localizeTextField = (node, locale = DEFAULT_MAP_LOCALE) => {
  const nameExpression = nameExpressionFor(locale);

  if (typeof node === 'string') {
    return NAME_TOKEN_PATTERN.test(node) ? nameExpression : node;
  }

  if (!Array.isArray(node)) return node;

  if (isGetOf(node, 'name:latin') || isGetOf(node, 'name')) {
    return nameExpression;
  }

  if (isHasOf(node, 'name:nonlatin')) {
    return false;
  }

  return node.map((filho) => localizeTextField(filho, locale));
};

/** Só mexe em layer que realmente rotula um nome — shields de rodovia ("{ref}") ficam de fora. */
export const textFieldReferencesName = (textField) =>
  JSON.stringify(textField ?? null).includes('name');

/**
 * Aplica a tradução em todas as symbol layers da style já carregada.
 * Precisa rodar depois do evento `style.load`.
 *
 * @param {import('maplibre-gl').Map} map
 * @param {string} [locale] 'pt' | 'en' | 'es'
 * @returns {number} quantas layers foram traduzidas
 */
export const localizeMapLabels = (map, locale = DEFAULT_MAP_LOCALE) => {
  const layers = map.getStyle()?.layers ?? [];
  let localized = 0;

  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;

    const textField = layer.layout?.['text-field'];
    if (!textField || !textFieldReferencesName(textField)) continue;

    map.setLayoutProperty(layer.id, 'text-field', localizeTextField(textField, locale));
    localized += 1;
  }

  return localized;
};
