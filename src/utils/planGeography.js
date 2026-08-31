// Rede de segurança geográfica do roteiro, no client.
//
// A Edge Function `travel-assistant` já entrega toda atividade com latitude, longitude,
// `category` (enum fechado) e `order`. Este módulo existe para os dois casos em que esse
// dado não passou pelo servidor:
//
//   1. Roteiros antigos, salvos em `travel_plans.plan_data` antes desses campos existirem.
//   2. A prévia local do planejador, montada offline quando a função não responde.
//
// A normalização é síncrona e sem rede; o preenchimento por geocoding é opcional e
// reaproveita a busca da tela de mapa (`geoSearch`), incluindo os apelidos em português.

import { normalizeSearchText, searchCities } from './geoSearch';

// Mesmo enum da Edge Function — os ícones do globo dependem desses valores.
export const PLACE_CATEGORIES = [
  'restaurante', 'atracao', 'compras', 'hotel',
  'transporte', 'natureza', 'vida_noturna', 'outro',
];

const CATEGORY_ALIASES = {
  passeio: 'atracao', atracao: 'atracao', turismo: 'atracao', museu: 'atracao',
  restaurante: 'restaurante', cafe: 'restaurante', gastronomia: 'restaurante',
  bar: 'vida_noturna', balada: 'vida_noturna', vida_noturna: 'vida_noturna',
  hotel: 'hotel', hospedagem: 'hotel',
  compras: 'compras', shopping: 'compras', mercado: 'compras',
  transporte: 'transporte',
  natureza: 'natureza', praia: 'natureza', parque: 'natureza',
};

// Palavras do título que denunciam a categoria quando o roteiro antigo não tem o campo.
const CATEGORY_HINTS = [
  { pattern: /jantar|almo[çc]o|caf[ée]|restaurante|gastron/, category: 'restaurante' },
  { pattern: /\bbar\b|balada|noturna|pub|drink/, category: 'vida_noturna' },
  { pattern: /hotel|hostel|pousada|check-?in|hospedagem/, category: 'hotel' },
  { pattern: /compras|shopping|mercado|feira|loja/, category: 'compras' },
  { pattern: /voo|aeroporto|trem|[ôo]nibus|traslado|transfer|deslocamento/, category: 'transporte' },
  { pattern: /praia|parque|trilha|montanha|cachoeira|jardim|natureza/, category: 'natureza' },
  { pattern: /museu|igreja|castelo|mirante|monumento|tour|visita/, category: 'atracao' },
];

export const normalizeCategory = (value, fallbackText = '') => {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (PLACE_CATEGORIES.includes(raw)) return raw;
  if (CATEGORY_ALIASES[raw]) return CATEGORY_ALIASES[raw];

  const normalized = normalizeSearchText(fallbackText);
  const hint = CATEGORY_HINTS.find((entry) => entry.pattern.test(normalized));
  return hint ? hint.category : 'outro';
};

/**
 * (0, 0) é "Null Island": quase sempre um campo vazio, não um lugar. Tratar como inválido
 * evita um pino no meio do Atlântico.
 */
export const isValidCoordinate = (latitude, longitude) =>
  Number.isFinite(latitude) && Number.isFinite(longitude)
  && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
  && !(latitude === 0 && longitude === 0);

/** Achata o roteiro em pontos prontos para plotagem, já ordenados por dia e sequência. */
export const getPlanPoints = (plan) => {
  const points = [];
  (plan?.days || []).forEach((day, dayIndex) => {
    (day?.activities || []).forEach((activity, activityIndex) => {
      if (!isValidCoordinate(activity?.latitude, activity?.longitude)) return;
      points.push({
        day: Number(day?.day) || dayIndex + 1,
        order: Number(activity?.order) || activityIndex + 1,
        title: activity?.title || '',
        description: activity?.description || '',
        category: normalizeCategory(activity?.category, activity?.title),
        latitude: activity.latitude,
        longitude: activity.longitude,
        approximate: Boolean(activity?.approximateCoordinate),
      });
    });
  });
  return points.sort((a, b) => a.day - b.day || a.order - b.order);
};

// Um único batch, como no servidor: blindar um roteiro legado não pode virar uma rajada
// de requisições na Photon.
const MAX_GEOCODE_LOOKUPS = 12;

const geocodeActivity = async (activity, signal) => {
  const query = activity?.mapQuery || activity?.location || activity?.title;
  if (!query) return null;
  try {
    const [city] = await searchCities(query, { signal, limit: 1 });
    return city && isValidCoordinate(city.lat, city.lng)
      ? { latitude: city.lat, longitude: city.lng }
      : null;
  } catch {
    return null;
  }
};

/**
 * Garante `category`, `order` e coordenada em todas as atividades de um roteiro.
 *
 * Não muta o plano recebido. Com `geocode: false` (padrão) roda offline e apenas
 * normaliza o que já existe; com `geocode: true` tenta preencher o que faltar pela rede.
 *
 * @param {object} plan roteiro no formato `{ days: [{ day, activities: [] }] }`
 * @param {object} [options]
 * @param {boolean} [options.geocode] habilita a busca remota das coordenadas faltantes
 * @param {{latitude:number,longitude:number}} [options.fallbackCoordinate] âncora do destino
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} novo roteiro com os campos garantidos
 */
export const ensurePlanCoordinates = async (plan, options = {}) => {
  const { geocode = false, fallbackCoordinate = null, signal } = options;
  if (!plan?.days?.length) return plan;

  const next = {
    ...plan,
    days: plan.days.map((day, dayIndex) => ({
      ...day,
      activities: (day?.activities || []).map((activity, activityIndex) => {
        const latitude = Number(activity?.latitude);
        const longitude = Number(activity?.longitude);
        const valid = isValidCoordinate(latitude, longitude);
        return {
          ...activity,
          day: Number(day?.day) || dayIndex + 1,
          order: activityIndex + 1,
          category: normalizeCategory(activity?.category, activity?.title),
          ...(valid ? { latitude, longitude } : { latitude: undefined, longitude: undefined }),
        };
      }),
    })),
  };

  const pending = next.days
    .flatMap((day) => day.activities)
    .filter((activity) => !isValidCoordinate(activity.latitude, activity.longitude));

  if (geocode && pending.length) {
    const lookups = pending.slice(0, MAX_GEOCODE_LOOKUPS);
    const resolved = await Promise.all(lookups.map((activity) => geocodeActivity(activity, signal)));
    lookups.forEach((activity, index) => {
      const coordinate = resolved[index];
      if (!coordinate) return;
      activity.latitude = coordinate.latitude;
      activity.longitude = coordinate.longitude;
      activity.coordinateSource = 'Photon';
    });
  }

  if (fallbackCoordinate && isValidCoordinate(fallbackCoordinate.latitude, fallbackCoordinate.longitude)) {
    pending.forEach((activity) => {
      if (isValidCoordinate(activity.latitude, activity.longitude)) return;
      activity.latitude = fallbackCoordinate.latitude;
      activity.longitude = fallbackCoordinate.longitude;
      activity.coordinateSource = 'destino (aproximado)';
      activity.approximateCoordinate = true;
    });
  }

  return next;
};
