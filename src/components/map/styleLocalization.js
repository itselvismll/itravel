// Traduz os rótulos do mapa para português.
//
// O schema OpenMapTiles (usado pela Stadia) traz um campo `name:<idioma>` por
// feature, mas as styles vêm montadas em cima de `name:latin` + `name:nonlatin`
// — daí "RUSSIA / РОССИЯ" em duas linhas. Verifiquei nos tiles da Stadia que
// `name:pt` existe e está bem preenchido (países, cidades, água, POIs).
//
// Em vez de reescrever cada text-field na mão (a style tem ~24 symbol layers com
// 4 formatos diferentes de expressão), caminhamos a expressão recursivamente e
// trocamos só as referências a nome. Assim continua funcionando se a Stadia
// mexer na style, e detalhes como a altitude dos picos (`... "\n" ele " m"`)
// sobrevivem intactos.
//
// Módulo sem dependência de react-native de propósito (countryUtils também é
// puro): roda no browser e é exercitado direto nos testes.

import { ALPHA3_TO_ALPHA2, getCountryNamePtByCode } from '../../utils/countryUtils';

const PT_FROM_TILE = [
  'coalesce',
  ['get', 'name:pt'],
  ['get', 'name:latin'],
  ['get', 'name'],
];

// O `name:pt` do OpenMapTiles é português europeu: vem "Quénia", "Seri-Lanca",
// "Moscovo". Num app brasileiro isso lê como bug. Para PAÍS dá para fazer melhor:
// a feature carrega `iso_a2`, e o app já sabe o nome pt-BR de cada código por
// getCountryNamePtByCode. Assim o rótulo no mapa bate exatamente com o nome
// usado no badge, na busca e no modal — em vez de duas grafias no mesmo app.
//
// Cidades e água continuam vindo do tile (não têm código ISO para cruzar).
const buildCountryNameMatch = () => {
  const pairs = [];
  for (const alpha2 of new Set(Object.values(ALPHA3_TO_ALPHA2))) {
    const name = getCountryNamePtByCode(alpha2, '');
    if (name && name !== alpha2) pairs.push(alpha2, name);
  }
  // `match` precisa de pelo menos um par; sem nomes resolvidos, cai no tile.
  if (pairs.length === 0) return PT_FROM_TILE;

  return [
    'case',
    ['has', 'iso_a2'],
    ['match', ['get', 'iso_a2'], ...pairs, PT_FROM_TILE],
    PT_FROM_TILE,
  ];
};

const PT_NAME_EXPRESSION = buildCountryNameMatch();

// Tokens no formato antigo de string ("{name:latin}").
const NAME_TOKEN_PATTERN = /^\{name(:latin)?\}$/;

const isGetOf = (node, key) =>
  Array.isArray(node) && node.length === 2 && node[0] === 'get' && node[1] === key;

const isHasOf = (node, key) =>
  Array.isArray(node) && node.length === 2 && node[0] === 'has' && node[1] === key;

/**
 * Reescreve uma expressão de text-field para usar `name:pt`.
 *
 * Duas substituições:
 * 1. `["get","name:latin"]` e `["get","name"]` viram o coalesce com `name:pt`.
 * 2. `["has","name:nonlatin"]` vira `false`, o que faz o ramo que concatena o
 *    nome em escrita nativa cair fora sozinho — sem sobrar "\n" solto, que é o
 *    que aconteceria se trocássemos só o `get` por string vazia.
 */
export const localizeTextField = (node) => {
  if (typeof node === 'string') {
    return NAME_TOKEN_PATTERN.test(node) ? PT_NAME_EXPRESSION : node;
  }

  if (!Array.isArray(node)) return node;

  if (isGetOf(node, 'name:latin') || isGetOf(node, 'name')) {
    return PT_NAME_EXPRESSION;
  }

  if (isHasOf(node, 'name:nonlatin')) {
    return false;
  }

  return node.map(localizeTextField);
};

/** Só mexe em layer que realmente rotula um nome — shields de rodovia ("{ref}") ficam de fora. */
export const textFieldReferencesName = (textField) =>
  JSON.stringify(textField ?? null).includes('name');

/**
 * Aplica a tradução em todas as symbol layers da style já carregada.
 * Precisa rodar depois do evento `style.load`.
 *
 * @param {import('maplibre-gl').Map} map
 * @returns {number} quantas layers foram traduzidas
 */
export const localizeMapLabels = (map) => {
  const layers = map.getStyle()?.layers ?? [];
  let localized = 0;

  for (const layer of layers) {
    if (layer.type !== 'symbol') continue;

    const textField = layer.layout?.['text-field'];
    if (!textField || !textFieldReferencesName(textField)) continue;

    map.setLayoutProperty(layer.id, 'text-field', localizeTextField(textField));
    localized += 1;
  }

  return localized;
};
