// Que tipos de notificação o app sabe mostrar.
//
// POR QUE ESTA LISTA IMPORTA MAIS DO QUE PARECE
//
// Ela não é documentação: é FILTRO. A tela de notificações busca com
// `.in('type', ...)` e marca como lida com o mesmo filtro. Tipo que não está aqui
// é invisível na tela E nunca é marcado como lido — o sino fica preso num número
// que o usuário não consegue zerar, porque não existe onde tocar.
//
// Foi exatamente o risco de acrescentar os tipos de viagem: a migração
// 20260917130000 liberou `trip_invite`, `trip_joined` e `trip_edit` no check da
// tabela, e enquanto eles não entraram aqui a notificação de convite chegaria ao
// banco e não apareceria para ninguém.
//
// AS DUAS FAMÍLIAS, e por que continuam separadas: as sociais nascem de
// interação entre pessoas (seguir, comentar, curtir); as de viagem nascem de
// colaboração num objeto compartilhado. Elas dividem a mesma tela e o mesmo sino,
// mas separar os nomes deixa possível tratá-las de forma diferente depois — uma
// aba própria, um silenciar por viagem — sem ter de descobrir quais tipos eram
// quais.

/** Interação entre pessoas. */
export const SOCIAL_NOTIFICATION_TYPES = Object.freeze(['follow', 'comment', 'like']);

/**
 * Colaboração numa viagem.
 *
 * `trip_edit` é AGRUPADA no banco (no máximo uma por viagem/autor/destinatário a
 * cada 30 minutos), senão salvar um roteiro de 21 dias geraria dezenas de linhas
 * por participante. Ver `log_trip_edit` na migração 20260917130000.
 *
 * As DUAS DE TAREFA não são agrupadas, e é de propósito: ali o evento é a ação
 * em si (criar, concluir), não "mexeu em algo". Três tarefas criadas na mesma
 * sessão são três coisas diferentes para fazer, e a janela de 30 minutos comeria
 * duas. Cada uma sai de uma transição de linha no banco — INSERT, e `is_done`
 * de false para true —, nunca de um botão da tela. Ver a migração 20260923140000.
 */
export const TRIP_NOTIFICATION_TYPES = Object.freeze([
  'trip_invite',
  'trip_joined',
  'trip_edit',
  'trip_task_created',
  'trip_task_done',
]);

/**
 * Tudo que a tela de notificações busca, mostra e marca como lido.
 *
 * É esta que as telas usam. As duas listas acima existem para quem precisa
 * distinguir a família; quem só quer "as notificações" usa esta.
 */
export const NOTIFICATION_TYPES = Object.freeze([
  ...SOCIAL_NOTIFICATION_TYPES,
  ...TRIP_NOTIFICATION_TYPES,
]);

export const isSocialNotification = notification =>
  SOCIAL_NOTIFICATION_TYPES.includes(notification?.type);

export const isTripNotification = notification =>
  TRIP_NOTIFICATION_TYPES.includes(notification?.type);

/** O app sabe o que fazer com esta notificação? */
export const isKnownNotification = notification =>
  NOTIFICATION_TYPES.includes(notification?.type);
