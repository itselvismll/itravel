// A aritmética do corte do grid de países.
//
// Vive num módulo separado do CountryGridSection porque o componente importa
// React Native, e o que decide QUANTOS itens aparecem não precisa de tela para
// ser conferido. Mesma divisão de planRoute.js/PlanRouteLayer.web.js: aqui é a
// regra, lá é o desenho.
export const GRID_LIMIT = 9;

/**
 * Chave estável de um item, seja qual for a lista de origem.
 *
 * As duas seções do perfil guardam formatos diferentes: o passaporte se
 * identifica pelo `country_code`, a wishlist pelo `id` da linha. Ler os dois
 * aqui é o que permite um componente só servir às duas sem uma prop dizendo
 * "sou o passaporte" — que é exatamente o tipo de lógica de seção que o
 * componente não deve ter.
 *
 * O `country_code` vem antes do `id` de propósito: ele é o que identifica o país
 * na tela, e é estável entre recarregamentos. O `id` é a reserva, e o índice é a
 * última linha de defesa para um registro sem nenhum dos dois — repetir chave no
 * React embaralha a lista em silêncio.
 *
 * @param {{ country_code?: string, id?: string|number }} country
 * @param {number} index
 * @returns {string}
 */
export const countryKey = (country, index) =>
  String(country?.country_code ?? country?.id ?? `item-${index}`);

/**
 * O que o grid mostra: os países visíveis e quantos ficaram de fora.
 *
 * Acima do limite, o último slot deixa de ser um país e vira o card "+N" — então
 * sobram oito países visíveis, não nove. É por isso que `remaining` conta a
 * partir de `GRID_LIMIT - 1`: o nono país não está escondido atrás do card, ele
 * está DENTRO da conta do "+N".
 *
 * Uma lista de exatamente 9 cabe inteira e não ganha card nenhum — trocar o nono
 * país por um "+1" gastaria um slot para esconder um único item.
 *
 * @param {Array<any>} countries
 * @param {number} [limit]
 * @returns {{ visible: Array<any>, remaining: number, hasMore: boolean }}
 */
export const gridSlots = (countries, limit = GRID_LIMIT) => {
  const list = countries ?? [];
  if (list.length <= limit) {
    return { visible: list, remaining: 0, hasMore: false };
  }

  return {
    visible: list.slice(0, limit - 1),
    remaining: list.length - (limit - 1),
    hasMore: true,
  };
};

/**
 * Rotação da etiqueta, pelo índice.
 *
 * Os quatro ângulos alternados são o que dá a leitura de adesivos colados à mão
 * em vez de células de uma tabela. Sai daqui para o card "+N" usar a mesma
 * sequência: uma etiqueta reta no meio das tortas denunciaria que ela é de outro
 * tipo antes de o usuário ler o texto.
 */
export const TAG_ROTATIONS = [-4, 3, -3, 4];

/** @param {number} index */
export const tagRotation = (index) => TAG_ROTATIONS[index % TAG_ROTATIONS.length];
