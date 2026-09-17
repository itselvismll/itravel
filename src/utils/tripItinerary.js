// Tradução entre o roteiro em LINHAS (trip_days/trip_activities, no Supabase) e
// o roteiro em OBJETO (`plan_data.days[]`, que é o formato que o app inteiro já
// lê: a tela do roteiro, o globo, o orçamento, o compartilhamento).
//
// POR QUE ESTA CAMADA EXISTE
//
// A normalização (migração 20260915130000) foi feita para a edição colaborativa:
// em linhas, duas pessoas mexendo em dias diferentes não se atropelam, e mover
// uma parada deixa de reescrever a viagem inteira. Mas o formato que as telas
// consomem não tinha por que mudar junto — e mudá-lo obrigaria a mexer em tudo
// de uma vez, que é exatamente o risco que esta fase evita.
//
// Então: o banco fala linhas, o app continua falando `days[]`, e a conversa
// acontece aqui. Módulo puro — sem rede, sem Supabase, sem React —, exercitado
// no teste sem banco nenhum.

/** snake_case do banco → camelCase do app, campo a campo. */
const activityFromRow = (row, index) => {
  const extra = (row?.extra && typeof row.extra === 'object') ? row.extra : {};

  return {
    // O que o app espera com nome próprio.
    order: Number(row?.position) || index + 1,
    period: row?.period ?? '',
    title: row?.title ?? '',
    description: row?.description ?? '',
    location: row?.location ?? '',
    duration: row?.duration ?? '',
    estimatedCost: row?.estimated_cost != null ? Number(row.estimated_cost) : 0,
    mapQuery: row?.map_query ?? '',
    officialUrl: row?.official_url ?? '',
    purchaseNote: row?.purchase_note ?? '',
    indoor: row?.indoor ?? false,
    latitude: row?.latitude ?? null,
    longitude: row?.longitude ?? null,
    coordinateSource: row?.coordinate_source ?? undefined,
    approximateCoordinate: row?.approximate_coordinate ?? undefined,
    category: row?.category || 'outro',
    rating: row?.rating != null ? Number(row.rating) : undefined,
    reviewCount: row?.review_count != null ? Number(row.review_count) : undefined,
    openingHours: Array.isArray(row?.opening_hours) ? row.opening_hours : undefined,
    verificationSource: row?.verification_source ?? undefined,
    placeId: row?.place_id ?? undefined,

    // O que a IA mandou e o schema ainda não modela. Vem por último para nunca
    // sobrescrever um campo que TEM coluna — se um dia `extra` guardar um
    // `title` antigo, quem vale é a coluna.
    ...extra,
  };
};

/**
 * As linhas do banco viram `days[]`.
 *
 * `null` (e não um array vazio) quando não há roteiro normalizado: é o sinal de
 * "leia o `plan_data`", para a viagem antiga que ainda não passou pela migração
 * continuar aparecendo. Um array vazio diria "esta viagem não tem dias", que é
 * uma afirmação diferente.
 *
 * @param {Array<any> | null | undefined} dayRows
 * @returns {Array<any> | null}
 */
export const itineraryFromRows = (dayRows) => {
  if (!Array.isArray(dayRows) || !dayRows.length) return null;

  return [...dayRows]
    // O PostgREST não garante a ordem de uma relação aninhada; o dia é ordenado
    // aqui, onde a regra é testável.
    .sort((a, b) => (Number(a?.day_number) || 0) - (Number(b?.day_number) || 0))
    .map((day, index) => ({
      day: Number(day?.day_number) || index + 1,
      date: day?.date ?? null,
      theme: day?.theme ?? '',
      activities: [...(day?.trip_activities ?? [])]
        .sort((a, b) => (Number(a?.position) || 0) - (Number(b?.position) || 0))
        .map(activityFromRow),
    }));
};

/**
 * O `days[]` do app vira o jsonb que `replace_trip_itinerary` espera.
 *
 * A RPC aceita o mesmo formato que a IA devolve — de propósito: salvar um
 * roteiro recém-gerado não precisa de tradução nenhuma no meio do caminho. Esta
 * função existe para o caso inverso, o de um roteiro que já passou pelo app e
 * pode ter vindo do fallback local.
 *
 * @param {{ days?: Array<any> } | null} plan
 * @returns {Array<any>} sempre um array, mesmo vazio — a RPC recusa outra coisa
 */
export const itineraryToRowsPayload = (plan) => {
  const days = plan?.days;
  if (!Array.isArray(days)) return [];

  return days.map((day, dayIndex) => ({
    day: Number(day?.day) || dayIndex + 1,
    date: day?.date ?? null,
    theme: day?.theme ?? '',
    activities: (Array.isArray(day?.activities) ? day.activities : []).map((activity, index) => ({
      ...activity,
      order: Number(activity?.order) || index + 1,
    })),
  }));
};
