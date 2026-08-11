// Âncoras manuais para os países onde o centróide calculado cai fora do próprio
// território.
//
// O cálculo automático (countryCentroids.js) acerta 234 dos 241 países: ele pega
// o centróide da MAIOR parte contínua, o que já resolve o caso comum de país com
// ilhas distantes (EUA sem o Alasca puxando o ponto, Noruega sem Svalbard).
// Sobram duas formas de território que nenhum centróide resolve:
//
// - côncavo ou fino demais: Vietnã tem forma de meia-lua e o centro geométrico
//   cai no Laos; Gâmbia é uma faixa de 30km em volta de um rio e o centro cai no
//   Senegal; Israel é estreito e curvo.
// - arquipélago de ilhas minúsculas: Maldivas, Bermudas, Chagos e Marshall têm
//   ilhas menores que a simplificação do dataset, e o centróide da maior delas
//   ainda cai na água.
//
// Cada coordenada aqui foi verificada contra o GeoJSON real com `geoContains`:
// são pontos que o dataset confirma estar em terra, dentro do país. Não são
// palpites de atlas — ver tests/country-anchors.test.cjs.
//
// Isto NÃO é lugar para corrigir centróide "meio torto". Um ponto dentro do país
// mas fora do centro visual é aceitável; a lista existe só para quem cai fora do
// território.
//
// [longitude, latitude] — a mesma ordem do GeoJSON e do MapLibre.

export const COUNTRY_COORDINATE_OVERRIDES = {
  // Meia-lua: o centro geométrico do Vietnã cai no Laos. Ponto no delta do rio
  // Vermelho, região de Hanói.
  VNM: [105.8, 21.0],
  // Faixa estreita em volta do rio Gâmbia, cercada pelo Senegal.
  GMB: [-15.6, 13.45],
  // Estreito e curvo; o centróide cai a oeste, no mar.
  ISR: [34.85, 31.5],
  // Atóis e ilhas pequenas demais para o traçado do dataset: o centróide da
  // maior ilha ainda cai na água (nos atóis, dentro da própria lagoa).
  MDV: [73.51, 4.17], // Malé
  BMU: [-64.75, 32.31],
  IOT: [72.42, -7.31], // Diego Garcia
  MHL: [171.2319, 7.0758], // faixa de terra do atol de Majuro
};

/**
 * Aplica o override, se houver, sobre uma âncora calculada.
 *
 * Só a POSIÇÃO é substituída. A área continua vindo do cálculo, porque é ela que
 * decide a prioridade do badge na disputa por espaço — um número inventado aqui
 * mudaria qual país mostra o nome escrito.
 *
 * @param {string} code código alpha-3 (ou ISO 3166-2 das nações do Reino Unido)
 * @param {{ lng: number, lat: number, area: number }} anchor
 * @returns {{ lng: number, lat: number, area: number }}
 */
export const applyCoordinateOverride = (code, anchor) => {
  const override = COUNTRY_COORDINATE_OVERRIDES[code];
  if (!override) return anchor;

  const [lng, lat] = override;
  return { ...anchor, lng, lat };
};
