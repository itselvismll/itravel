// Os números que a capa da viagem mostra: quantos dias, quantos viajantes,
// quantas paradas, e como cada um desses vira texto em português.
//
// Módulo puro — sem rede, sem React, sem Supabase. O que mora aqui é a parte que
// erra em silêncio (uma viagem de "0 dias", um "1 viajantes", uma data que vira
// a véspera por causa de fuso) e que, sendo pura, o teste pega sem montar tela.
import { toBrazilianDate } from './dateUtils';

/**
 * Quantos dias a viagem tem.
 *
 * A conta das datas é a MESMA do TripPlannerScreen, que é quem pergunta isso ao
 * usuário: diferença em dias mais um, porque uma viagem que começa e termina no
 * mesmo dia dura um dia, não zero. Ela é repetida aqui por um motivo: lá ela
 * mede o que foi PEDIDO (dois campos de formulário), e aqui o que existe (um
 * roteiro salvo). Unificar as duas obrigaria a tela de planejamento a depender
 * do formato do roteiro salvo, que ela nem carrega.
 *
 * A contagem de dias do roteiro vem primeiro quando existe: ela é o que está
 * desenhado na tela. As datas são a reserva para o roteiro que ainda não tem
 * dias (ou que falhou na geração).
 *
 * @param {{ startDate?: string|null, endDate?: string|null, planDays?: number }} params
 * @returns {number | null} null quando não dá para saber
 */
export const tripDurationDays = ({ startDate, endDate, planDays } = {}) => {
  const fromPlan = Number(planDays);
  if (Number.isFinite(fromPlan) && fromPlan > 0) return Math.floor(fromPlan);

  const start = startDate ? new Date(`${startDate}T12:00:00Z`) : null;
  const end = endDate ? new Date(`${endDate}T12:00:00Z`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) return null;

  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

/**
 * Quantas paradas o roteiro tem.
 *
 * Conta ATIVIDADE, não coordenada: uma parada sem latitude continua sendo uma
 * parada do dia (um voo, um check-in), ela só não vira pino no mapa. É a mesma
 * contagem que `trip_activities` tem no banco, porque é dela que o roteiro vem
 * desde a Fase 0.
 *
 * @param {{ days?: Array<any> } | null} plan
 * @returns {number}
 */
export const countPlanStops = (plan) => (plan?.days ?? []).reduce(
  (total, day) => total + (Array.isArray(day?.activities) ? day.activities.length : 0),
  0
);

/** Plural em português sem repetir `n === 1 ? ... : ...` em cinco lugares. */
const plural = (count, singular, pluralWord) =>
  `${count} ${count === 1 ? singular : pluralWord}`;

/**
 * Os chips de metadados da capa, na ordem em que aparecem.
 *
 * Um chip sem dado NÃO entra: "—" ou "0 paradas" ocupa o mesmo espaço de um
 * dado real e não diz nada. Viagem sem data de início, por exemplo, mostra
 * três chips em vez de quatro — e isso é comum, porque o planejador aceita
 * "quero 5 dias" sem escolher quando.
 *
 * @param {{
 *   startDate?: string|null,
 *   durationDays?: number|null,
 *   travelers?: number|null,
 *   stops?: number|null,
 * }} params
 * @returns {Array<{ id: string, icon: string, label: string }>}
 */
export const tripChips = ({ startDate, durationDays, travelers, stops } = {}) => {
  const chips = [];

  const dateLabel = startDate ? toBrazilianDate(startDate) : '';
  if (dateLabel) chips.push({ id: 'date', icon: 'calendar-outline', label: dateLabel });

  if (Number.isFinite(durationDays) && durationDays > 0) {
    chips.push({ id: 'duration', icon: 'flag-outline', label: plural(durationDays, 'dia', 'dias') });
  }

  const people = Number(travelers);
  if (Number.isFinite(people) && people > 0) {
    chips.push({
      id: 'travelers',
      icon: 'people-outline',
      label: plural(people, 'viajante', 'viajantes'),
    });
  }

  const points = Number(stops);
  if (Number.isFinite(points) && points > 0) {
    chips.push({
      id: 'stops',
      icon: 'location-outline',
      label: plural(points, 'parada', 'paradas'),
    });
  }

  return chips;
};

/**
 * O nome que a capa mostra quando a viagem tem mais de um país.
 *
 * O título vinha de `plan.destinationCountry`, que é UM país — então uma viagem
 * Itália + Croácia + Eslováquia se anunciava como "Itália", e os outros dois
 * destinos simplesmente não existiam na tela.
 *
 * A lista é escrita como se escreve em português: vírgula entre os primeiros e
 * "e" antes do último. A partir do quarto país a frase estoura o espaço do
 * título mesmo em duas linhas, e aí os dois primeiros ficam e o resto vira
 * contagem — "Itália, Croácia +2" diz quantos são sem tentar caber.
 *
 * @param {Array<{name?: string} | string> | null} destinations
 * @param {string} [fallback] o que usar quando não há lista (ex.: request.destination)
 * @returns {string}
 */
export const destinationTitle = (destinations, fallback = '') => {
  const names = (Array.isArray(destinations) ? destinations : [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);

  // Sem lista, vale o que houver — inclusive a string já juntada por vírgula que
  // o planejador grava em `destination`.
  if (!names.length) return (fallback || '').trim();

  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} e ${names[2]}`;

  return `${names[0]}, ${names[1]} +${names.length - 2}`;
};

/**
 * O termo que a busca da foto de capa usa.
 *
 * NÃO é o título. O título mostra a viagem inteira ("Itália, Croácia e
 * Eslováquia"); a busca de imagem precisa de UM lugar. Passar o título para o
 * Wikimedia devolve zero resultado — a frase inteira não casa com nada — e a
 * capa fica sem foto, que foi exatamente o que aconteceu quando o título passou
 * a juntar os destinos.
 *
 * Vale o primeiro destino da lista. Sem lista, vale o primeiro pedaço do texto
 * até a vírgula: é assim que o planejador grava `destination` quando há mais de
 * um país, e também resolve "Paris, França" para "Paris".
 *
 * @param {Array<{name?: string} | string> | null} destinations
 * @param {string} [fallback]
 * @returns {string}
 */
export const coverSearchTerm = (destinations, fallback = '') => {
  const first = (Array.isArray(destinations) ? destinations : [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .find((name) => typeof name === 'string' && name.trim());

  if (first) return first.trim();

  return String(fallback || '').split(',')[0].trim();
};
