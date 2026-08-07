// Tabela única que descreve cada tipo de notificação: como o banner se apresenta e para
// onde o toque leva. Manter isso fora do componente permite adicionar um tipo novo (ou
// ligar um que está esperando o schema do parceiro) mexendo em um lugar só.

/**
 * Rotas registradas hoje no RootStack (ver AppNavigator.js).
 * `message` e `passport` apontam para telas que ainda NÃO existem — o roteamento delas já
 * está escrito, mas fica inerte até as telas serem registradas aqui e no navigator.
 */
export const REGISTERED_ROUTES = [
  'Main',
  'PublicProfile',
  'PhotoDetail',
  'TripPlanner',
  'AssistantResult',
  'Notificações',
  'Connections',
];

export const isRouteRegistered = (routeName) => REGISTERED_ROUTES.includes(routeName);

const BADGE = {
  message:  { icon: 'chatbubble',            color: '#FF9A00' },
  follow:   { icon: 'checkmark',             color: '#00D1C1' },
  passport: { icon: 'ribbon',                color: '#6C2BD9' },
  comment:  { icon: 'chatbubble-ellipses',   color: '#FF4D6D' },
};

const DEFAULT_BADGE = { icon: 'notifications', color: '#6C2BD9' };

export const getBadge = (type) => BADGE[type] || DEFAULT_BADGE;

/**
 * Título do banner. `actorName` já vem resolvido (display_name > username > 'Alguém').
 * Para os tipos legados (follow/comment) a frase do banco é reaproveitada, que é o texto
 * que a tela de Notificações já mostra hoje.
 */
export const getTitle = (notification, actorName) => {
  switch (notification?.type) {
    case 'message':
      return `${actorName} te enviou uma mensagem`;
    case 'follow':
      return `${actorName} começou a seguir você`;
    case 'passport':
      return 'Você recebeu um passaporte';
    case 'comment':
      return `${actorName} comentou sua foto`;
    default:
      return notification?.message
        ? `${actorName} ${notification.message}`
        : 'Você tem uma notificação';
  }
};

/**
 * Destino do deep link. Retorna null quando não há para onde ir (ex.: notificação sem o
 * id de destino preenchido), e o chamador apenas descarta o banner.
 *
 * @param {{ type?: string, target_id?: string, photo_id?: any, actor?: { id?: string, username?: string } }} notification
 * @returns {{ name: string, params: object } | null}
 */
export const getRoute = (notification) => {
  const actor = notification?.actor;
  const targetId = notification?.target_id || null;

  switch (notification?.type) {
    case 'message':
      // Aguardando o schema de DMs: `target_id` guardará o conversation_id.
      if (!targetId) return null;
      return {
        name: 'Conversation',
        params: {
          conversationId: targetId,
          userId: actor?.id,
          username: actor?.username,
        },
      };

    case 'passport':
      // Aguardando o schema de passaportes: `target_id` guardará o passport_id.
      if (!targetId) return null;
      return { name: 'PassportDetail', params: { passportId: targetId } };

    case 'comment': {
      const photoId = targetId || notification?.photo_id;
      if (!photoId) return null;
      return { name: 'PhotoDetail', params: { photoId } };
    }

    case 'follow':
    default: {
      const userId = targetId || actor?.id;
      if (!userId) return null;
      return {
        name: 'PublicProfile',
        params: { userId, username: actor?.username },
      };
    }
  }
};
