// Números e moeda, num lugar só.
//
// O MESMO motivo de `formatDate`: o separador decimal é vírgula em pt e es e
// ponto em en, e o símbolo da moeda troca de lado ("R$ 1.234,50" contra
// "$1,234.50"). Isso não é detalhe estético — "1.234" lido com as regras erradas
// é mil vezes o valor, e orçamento de viagem é exatamente onde isso aparece.
//
// MÓDULO PURO, como `formatDate`: locale por parâmetro, `pt-BR` por padrão,
// try/catch em tudo com saída crua. Número ilegível é ruim; tela derrubada por
// causa de formatação é pior.

import { DEFAULT_LOCALE_TAG } from './constants';

/**
 * Número para exibição.
 *
 * @param {number | string | null | undefined} value
 * @param {string} [tag]
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {string} '' quando não é número — e não 'NaN' na tela
 */
export const formatNumber = (value, tag, options) => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '';

  try {
    return new Intl.NumberFormat(tag || DEFAULT_LOCALE_TAG, options).format(n);
  } catch {
    return String(n);
  }
};

/**
 * Valor em dinheiro.
 *
 * `currency` é OBRIGATÓRIO e separado do locale, porque são coisas
 * independentes: um brasileiro planejando viagem ao Japão vê iene formatado à
 * brasileira ("JP¥ 15.000"), e um americano vê o mesmo iene à americana
 * ("¥15,000"). Amarrar a moeda ao idioma mostraria o orçamento na moeda errada.
 *
 * As casas decimais ficam por conta do `Intl`: ele sabe que iene não tem centavo
 * e que real tem dois. Forçar `minimumFractionDigits: 2` mostraria "JP¥ 15.000,00",
 * que não existe.
 *
 * @param {number | string | null | undefined} value
 * @param {string} currency código ISO 4217 ('BRL', 'USD', 'JPY')
 * @param {string} [tag]
 * @param {Intl.NumberFormatOptions} [options]
 */
export const formatCurrency = (value, currency, tag, options) => {
  const n = typeof value === 'string' ? Number(value) : value;
  if (n === null || n === undefined || !Number.isFinite(n)) return '';

  try {
    return new Intl.NumberFormat(tag || DEFAULT_LOCALE_TAG, {
      style: 'currency',
      currency: currency || 'BRL',
      ...options,
    }).format(n);
  } catch {
    // Moeda que o Intl não conhece cai aqui. O código antes do número é o
    // formato que não mente sobre qual moeda é.
    return `${currency || ''} ${formatNumber(n, tag)}`.trim();
  }
};

/**
 * Valor compacto: "1,2 mil", "1.2K", "3,4 mi".
 *
 * É o formato dos contadores de perfil (seguidores, fotos), onde o número exato
 * não importa e o espaço é apertado. O `Intl` tem as abreviações de cada idioma,
 * que é o que torna isto melhor do que dividir por mil na mão.
 *
 * @param {number | string | null | undefined} value
 * @param {string} [tag]
 */
export const formatCompactNumber = (value, tag) => formatNumber(value, tag, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Distância, em metros ou quilômetros conforme a grandeza.
 *
 * SEM conversão para milha nesta fase, de propósito: unidade não é idioma. Um
 * brasileiro lendo o app em inglês continua querendo quilômetro, e quem usa
 * milha pode falar português. A tela "Unidades e moeda" é entrega própria — ver
 * a seção PREFERÊNCIAS do menu —, e quando ela existir é dela que sai o sistema
 * de unidade, não daqui.
 *
 * @param {number | null | undefined} meters
 * @param {string} [tag]
 */
export const formatDistance = (meters, tag) => {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '';

  if (meters < 1000) {
    return `${formatNumber(Math.round(meters), tag)} m`;
  }
  const km = meters / 1000;
  return `${formatNumber(km, tag, { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
};
