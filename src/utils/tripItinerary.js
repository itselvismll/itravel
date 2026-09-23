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

import { planDayNumber } from '../components/map/planDayStrip';

/** snake_case do banco → camelCase do app, campo a campo. */
const activityFromRow = (row, index) => {
  const extra = (row?.extra && typeof row.extra === 'object') ? row.extra : {};

  return {
    // ── A IDENTIDADE DA LINHA, e por que ela agora sobe até a tela ──
    //
    // Estes três campos eram descartados aqui, e o efeito disso estava no banco:
    // sem o `id`, o app não tinha como dizer QUAL parada ele estava salvando, e a
    // única escrita possível era apagar o roteiro inteiro e reinserir. Com o id
    // de volta, `sync_trip_itinerary` casa item a item — e o histórico, a autoria
    // e a guarda de conflito passam a ter em que se apoiar.
    //
    // `updatedAt` é a VERSÃO de que esta cópia partiu. Ela volta no salvamento, e
    // é o que permite ao banco recusar sobrescrever uma parada que outra pessoa
    // mexeu no meio do caminho.
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

    // O que a IA mandou e o schema ainda não modela. Vem depois dos campos com
    // coluna, então um valor guardado em `extra` PREVALECE sobre o da coluna
    // quando os dois existem.
    ...extra,

    // ── A IDENTIDADE DA LINHA, e por que ela vem DEPOIS de `extra` ──
    //
    // Estes três campos eram descartados aqui, e o efeito estava no banco: sem o
    // `id`, o app não tinha como dizer QUAL parada estava salvando, e apagar o
    // roteiro inteiro e reinserir era a única escrita possível. Com o id de volta,
    // `sync_trip_itinerary` casa item a item — e o histórico, a autoria e a guarda
    // de conflito passam a ter em que se apoiar.
    //
    // Ficam por último porque identidade não se negocia com conteúdo. `extra`
    // guarda o que a IA mandou; se algum dia ele trouxer um `id`, ele estaria
    // apontando esta parada para OUTRA linha do banco — e o save escreveria no
    // lugar errado. Aqui a linha sempre vence.
    //
    // `updatedAt` é a VERSÃO de que esta cópia partiu. Ela volta no salvamento, e
    // é o que permite ao banco recusar sobrescrever uma parada que outra pessoa
    // mexeu no meio do caminho.
    id: row?.id ?? undefined,
    updatedAt: row?.updated_at ?? undefined,
    lastEditedBy: row?.last_edited_by ?? undefined,
    // A autoria da tag "editado por X" (utils/activityAttribution). Só leitura:
    // quem escreve as três colunas é o trigger do banco, e o sync ignora o que
    // voltar delas no payload.
    lastEditedAt: row?.last_edited_at ?? undefined,
    createdBy: row?.created_by ?? undefined,
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
      // Mesma razão do `id` da parada: sem ele, o dia seria recriado a cada save.
      id: day?.id ?? undefined,
      updatedAt: day?.updated_at ?? undefined,
      lastEditedBy: day?.last_edited_by ?? undefined,
      // A mesma conta única, só com o campo do banco (`day_number`) no lugar do
      // campo do app (`day`). A regra é uma: o número declarado quando houver,
      // senão a posição na lista, 1-based.
      day: planDayNumber({ day: day?.day_number }, index),
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
    // `id` e `updatedAt` VOLTAM para o banco, e é isso que transforma o
    // salvamento de "apaga tudo e reinsere" em "sincroniza o que mudou". Item sem
    // `id` é item novo — que é o caso do roteiro recém-gerado pela IA, onde não há
    // id nenhum e tudo é inserção.
    id: day?.id ?? undefined,
    updatedAt: day?.updatedAt ?? undefined,
    // `planDayNumber` e não uma cópia da fórmula: era a sexta cópia dela no
    // projeto, e numeração duplicada é a raiz da família de bugs de "dia errado".
    day: planDayNumber(day, dayIndex),
    date: day?.date ?? null,
    theme: day?.theme ?? '',
    activities: (Array.isArray(day?.activities) ? day.activities : []).map((activity, index) => ({
      ...activity,
      id: activity?.id ?? undefined,
      updatedAt: activity?.updatedAt ?? undefined,
      order: Number(activity?.order) || index + 1,
    })),
  }));
};
