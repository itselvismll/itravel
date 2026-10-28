// Datas, num lugar só.
//
// POR QUE CENTRALIZAR
//
// Antes desta fase havia 34 chamadas de `toLocaleDateString`/`toLocaleString`
// espalhadas por 19 arquivos, a maioria com `'pt-BR'` escrito na mão. Cada uma
// delas é um lugar onde trocar de idioma não teria efeito — e, pior, cada uma
// tinha o seu próprio conjunto de opções, então a mesma data saía em três
// formatos diferentes em três telas.
//
// Aqui o locale é PARÂMETRO, com `pt-BR` como padrão. As telas passam o `tag` do
// `useLocale()`; o que não é tela (serviço, módulo puro) continua funcionando sem
// passar nada.
//
// MÓDULO PURO de propósito — sem react-native, sem o contexto de idioma. É o que
// permite o `node:test` exercitar formato de data sem browser, e é a mesma regra
// que `geoMeasure` e `tripSummary` seguem.
//
// SOBRE `Intl` NO REACT NATIVE: no Hermes moderno (Expo 55) `Intl` existe com
// os locales completos, e na web é nativo. Mesmo assim cada função aqui tem
// try/catch com saída em ISO: data ilegível é ruim, tela quebrada é pior, e
// formatação nunca deve ser o que derruba uma tela.

import { DEFAULT_LOCALE_TAG } from './constants';

/**
 * Para `Date`, aceitando o que o app de fato tem em mãos: `Date`, string ISO do
 * Supabase, ou número.
 *
 * @param {Date | string | number | null | undefined} value
 * @returns {Date | null} null quando não dá para ler — e aí quem chama decide o
 *   que mostrar, em vez de receber "Invalid Date" na tela.
 */
export const toDate = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === '') return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const format = (value, options, tag, fallback) => {
  const date = toDate(value);
  if (!date) return '';

  try {
    return new Intl.DateTimeFormat(tag || DEFAULT_LOCALE_TAG, options).format(date);
  } catch {
    return fallback(date);
  }
};

/** 18/09/2026 · 09/18/2026 · 18/9/2026, conforme o locale. */
export const formatDateShort = (value, tag) => format(
  value,
  { day: '2-digit', month: '2-digit', year: 'numeric' },
  tag,
  (d) => d.toISOString().slice(0, 10)
);

/** 18 de setembro de 2026 · September 18, 2026 · 18 de septiembre de 2026. */
export const formatDateLong = (value, tag) => format(
  value,
  { day: 'numeric', month: 'long', year: 'numeric' },
  tag,
  (d) => d.toISOString().slice(0, 10)
);

/** 08 de setembro de 2026 · September 08, 2026 — como formatDateLong, com o dia padded. */
export const formatDateLongPadded = (value, tag) => format(
  value,
  { day: '2-digit', month: 'long', year: 'numeric' },
  tag,
  (d) => d.toISOString().slice(0, 10)
);

/** 18 de set. de 2026 · Sep 18, 2026 — o formato dos cartões de foto, com o ano. */
export const formatDayMonthYear = (value, tag) => format(
  value,
  { day: '2-digit', month: 'short', year: 'numeric' },
  tag,
  (d) => d.toISOString().slice(0, 10)
);

/** 18 de set · Sep 18 — o formato dos cartões, onde o ano não cabe nem importa. */
export const formatDayMonth = (value, tag) => format(
  value,
  { day: 'numeric', month: 'short' },
  tag,
  (d) => d.toISOString().slice(5, 10)
);

/** 08 de set · Sep 08 — como formatDayMonth, mas com o dia sempre em dois dígitos. */
export const formatDayMonthPadded = (value, tag) => format(
  value,
  { day: '2-digit', month: 'short' },
  tag,
  (d) => d.toISOString().slice(5, 10)
);

/** 18/09/2026 14:03. */
export const formatDateTime = (value, tag) => format(
  value,
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  tag,
  (d) => d.toISOString().slice(0, 16).replace('T', ' ')
);

/** 14:03 — e 2:03 PM em inglês, que é o ponto de deixar o locale decidir. */
export const formatTime = (value, tag) => format(
  value,
  { hour: '2-digit', minute: '2-digit' },
  tag,
  (d) => d.toISOString().slice(11, 16)
);

/** setembro de 2026 · September 2026. */
export const formatMonthYear = (value, tag) => format(
  value,
  { month: 'long', year: 'numeric' },
  tag,
  (d) => d.toISOString().slice(0, 7)
);

/**
 * O nome do dia da semana, como a faixa de dias do roteiro usa.
 *
 * @param {Date | string | number} value
 * @param {string} [tag]
 * @param {'long' | 'short' | 'narrow'} [width]
 */
export const formatWeekday = (value, tag, width = 'short') => format(
  value,
  { weekday: width },
  tag,
  (d) => String(d.getDay())
);

/**
 * "18 – 25 de set" numa linha, respeitando o separador de cada idioma.
 *
 * `formatRange` existe no Intl e faz isto melhor do que concatenar duas datas com
 * um travessão: ele sabe que em inglês o intervalo de meses diferentes se escreve
 * "Sep 18 – Oct 2" e que no mesmo mês se escreve "Sep 18 – 25", sem repetir o mês.
 *
 * @param {Date | string | number} start
 * @param {Date | string | number} end
 * @param {string} [tag]
 */
export const formatDateRange = (start, end, tag) => {
  const a = toDate(start);
  const b = toDate(end);
  if (!a && !b) return '';
  if (!a || !b) return formatDayMonth(a || b, tag);

  try {
    const formatter = new Intl.DateTimeFormat(tag || DEFAULT_LOCALE_TAG, {
      day: 'numeric',
      month: 'short',
    });
    // `formatRange` é relativamente novo; onde não existir, cai na concatenação.
    if (typeof formatter.formatRange === 'function') return formatter.formatRange(a, b);
    return `${formatter.format(a)} – ${formatter.format(b)}`;
  } catch {
    return `${formatDayMonth(a, tag)} – ${formatDayMonth(b, tag)}`;
  }
};

/**
 * Quantos dias de intervalo, contando as duas pontas.
 *
 * Não formata nada — está aqui porque é a conta que acompanha toda exibição de
 * intervalo, e espalhá-la junto com a formatação foi o que produziu as versões
 * divergentes que esta fase está juntando.
 *
 * @returns {number} 0 quando alguma ponta não é data
 */
export const daysBetweenInclusive = (start, end) => {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return 0;

  // Normaliza para meia-noite UTC antes de subtrair: sem isso, um intervalo que
  // cruza horário de verão dá 20,96 dias e o `round` esconde o problema só às
  // vezes.
  const diaA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const diaB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.abs(Math.round((diaB - diaA) / 86400000)) + 1;
};
