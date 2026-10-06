// De qual CATEGORIA é cada tipo de notificação — e, por consequência, qual
// interruptor da tela de preferências manda nele.
//
// ESTE ARQUIVO TEM UM GÊMEO NO BANCO
//
// A mesma tabela existe em SQL, como `public.notification_category(text)`, porque
// o filtro de verdade roda num trigger BEFORE INSERT em `notifications` — é lá,
// e não aqui, que o aviso deixa de nascer. Esta cópia em JS serve à TELA: é o que
// desenha as seções e sabe qual coluna cada interruptor grava.
//
// Duas cópias da mesma tabela divergem em silêncio, então
// `tests/notification-preferences.test.cjs` lê o CASE da migração e compara com o
// mapa daqui. Mexeu num, o teste cobra o outro.
//
// TIPO SEM CATEGORIA PASSA. Essa é a regra, no banco e aqui: o custo de um aviso
// a mais é um aviso a mais; o custo de errar para o outro lado é uma notificação
// que nunca chega e ninguém descobre por quê. Quem acrescentar um tipo novo em
// `socialNotifications.js` e esquecer deste arquivo tem um aviso que sempre
// chega — nunca um aviso que sumiu.
//
// HOJE TODO TIPO VIVO TEM CATEGORIA. O caminho de escape acima continua valendo
// para o tipo que vier depois; nenhum tipo existente depende dele.

/** A coluna de `notification_preferences` que manda em cada categoria. */
export const NOTIFICATION_CATEGORIES = Object.freeze([
  'social_follows',
  'social_comments',
  'social_likes',
  'social_messages',
  'trip_invites',
  'trip_joins',
  'trip_edits',
  'trip_tasks',
]);

/**
 * Tipo de notificação → categoria.
 *
 * `trip_task_created` e `trip_task_done` caem na MESMA categoria de propósito:
 * "tarefa criada" e "tarefa concluída" são os dois lados do mesmo assunto, e
 * ninguém quer receber uma e não a outra. Um interruptor, dois tipos.
 */
export const NOTIFICATION_TYPE_CATEGORY = Object.freeze({
  follow: 'social_follows',
  comment: 'social_comments',
  like: 'social_likes',
  message: 'social_messages',
  // Passaporte DIVIDE a categoria com mensagem direta, e de propósito não tem
  // linha própria na tela: ele chega pelo chat, como anexo de uma mensagem. Dois
  // tipos, um interruptor — como as duas de tarefa.
  passport: 'social_messages',
  trip_invite: 'trip_invites',
  trip_joined: 'trip_joins',
  trip_edit: 'trip_edits',
  trip_task_created: 'trip_tasks',
  trip_task_done: 'trip_tasks',
});

/**
 * A categoria de um tipo, ou `null` quando ele não tem interruptor.
 *
 * @param {string | null | undefined} type
 * @returns {string | null}
 */
export const categoryForNotificationType = (type) =>
  (typeof type === 'string' && NOTIFICATION_TYPE_CATEGORY[type]) || null;

/**
 * Esta categoria está ligada, para quem tem estas preferências?
 *
 * Responde a mesma pergunta que o trigger do banco, com as mesmas três saídas:
 * sem categoria passa, sem linha de preferência passa, `all_enabled` desligado
 * barra tudo.
 *
 * Existe para a tela poder explicar o que está acontecendo sem adivinhar — e
 * para o teste conseguir afirmar a regra sem subir um Postgres.
 *
 * @param {string | null | undefined} type
 * @param {Record<string, unknown> | null | undefined} preferences
 * @returns {boolean}
 */
export const isNotificationTypeEnabled = (type, preferences) => {
  const category = categoryForNotificationType(type);
  if (!category) return true;
  if (!preferences) return true;
  if (preferences.all_enabled === false) return false;
  return preferences[category] !== false;
};

// ── A TELA ──────────────────────────────────────────────────────────────────
//
// As seções vivem aqui, e não dentro do componente, porque esta é a lista que
// precisa combinar com as colunas da tabela — e com isso aqui em módulo puro o
// teste consegue cobrar que combina, sem renderizar nada.
//
// MENSAGEM DIRETA VOLTOU A SER NOTIFICAÇÃO na migração 20260930120000, com um
// aviso POR CONVERSA não lida (e não por mensagem, que foi o motivo da remoção na
// 20260812130000). O contador da aba de conversas continua vindo de
// `messages.read_at`, por `get_unread_message_count`: são duas contagens de
// coisas diferentes, e o interruptor daqui só manda no aviso do sino.

/**
 * O `icon` é tipado pelo Ionicons, e não como `string`: é o que faz um nome de
 * ícone inexistente falhar no `tsc` em vez de virar um quadrado vazio na tela.
 *
 * `labelKey` e `subtitleKey` são CHAVES de tradução, não texto. O módulo segue
 * puro — quem resolve a chave é a tela, com o `t` do contexto de idioma. Guardar
 * o português aqui tornaria este arquivo intraduzível sem reescrevê-lo.
 *
 * @typedef {{
 *   key: string,
 *   icon: React.ComponentProps<typeof import('@expo/vector-icons').Ionicons>['name'],
 *   labelKey: string,
 *   subtitleKey?: string,
 * }} PreferenceRow
 */

/**
 * As seções da tela, com CHAVE de tradução em vez de texto.
 *
 * O prefixo é sempre `notificationPreferences.rows.<coluna>`, e o subtítulo
 * acrescenta `Subtitle`. A convenção é proposital: a chave sai do nome da
 * coluna, então acrescentar uma categoria é acrescentar uma coluna, uma entrada
 * no CASE do SQL, uma linha aqui e uma chave nos três JSON — e o teste cobra os
 * quatro.
 *
 * @type {ReadonlyArray<{ titleKey: string, rows: ReadonlyArray<PreferenceRow> }>}
 */
export const NOTIFICATION_PREFERENCE_SECTIONS = Object.freeze([
  Object.freeze({
    titleKey: 'notificationPreferences.sections.social',
    rows: Object.freeze([
      Object.freeze({ key: 'social_follows', icon: 'person-add-outline', labelKey: 'notificationPreferences.rows.social_follows' }),
      Object.freeze({ key: 'social_comments', icon: 'chatbubble-outline', labelKey: 'notificationPreferences.rows.social_comments' }),
      Object.freeze({ key: 'social_likes', icon: 'heart-outline', labelKey: 'notificationPreferences.rows.social_likes' }),
      // Uma linha, DOIS tipos: `message` e `passport`. O subtítulo fala de
      // conversa, e não de "um aviso por conversa", porque o agrupamento vale só
      // para mensagem — passaporte compartilhado gera um aviso por passaporte.
      Object.freeze({
        key: 'social_messages',
        icon: 'chatbubbles-outline',
        labelKey: 'notificationPreferences.rows.social_messages',
        subtitleKey: 'notificationPreferences.rows.social_messagesSubtitle',
      }),
    ]),
  }),
  Object.freeze({
    titleKey: 'notificationPreferences.sections.trips',
    rows: Object.freeze([
      Object.freeze({ key: 'trip_invites', icon: 'mail-open-outline', labelKey: 'notificationPreferences.rows.trip_invites' }),
      Object.freeze({ key: 'trip_joins', icon: 'people-outline', labelKey: 'notificationPreferences.rows.trip_joins' }),
      Object.freeze({
        key: 'trip_edits',
        icon: 'create-outline',
        labelKey: 'notificationPreferences.rows.trip_edits',
        subtitleKey: 'notificationPreferences.rows.trip_editsSubtitle',
      }),
      Object.freeze({
        key: 'trip_tasks',
        icon: 'checkbox-outline',
        labelKey: 'notificationPreferences.rows.trip_tasks',
        subtitleKey: 'notificationPreferences.rows.trip_tasksSubtitle',
      }),
    ]),
  }),
]);

/**
 * Tudo ligado: o que vale para quem nunca abriu esta tela.
 *
 * O typedef existe porque sem ele o TypeScript infere `all_enabled: true` — o
 * valor LITERAL, não `boolean` — e aí `prefs.all_enabled === false` vira erro de
 * "tipos que não se sobrepõem". É a tela comparando com false que precisa compilar.
 *
 * @type {Readonly<Record<string, boolean>>}
 */
export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  all_enabled: true,
  ...Object.fromEntries(NOTIFICATION_CATEGORIES.map((category) => [category, true])),
});
