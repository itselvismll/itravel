/**
 * Rotas que podem ser abertas por notificações, incluindo os destinos sociais
 * adicionados pelas conversas e pelos passaportes compartilhados.
 */
export const REGISTERED_ROUTES = Object.freeze([
  'Main',
  'PublicProfile',
  'PhotoDetail',
  'TripPlanner',
  'AssistantResult',
  'Notificações',
  'Connections',
  'Conversation',
  'PassportDetail',
]);

export const isRouteRegistered = routeName => REGISTERED_ROUTES.includes(routeName);

const BADGE = {
  message: { icon: 'chatbubble', color: '#FF9A00' },
  follow: { icon: 'checkmark', color: '#00D1C1' },
  passport: { icon: 'ribbon', color: '#6C2BD9' },
  comment: { icon: 'chatbubble-ellipses', color: '#FF4D6D' },
};

const DEFAULT_BADGE = { icon: 'notifications', color: '#6C2BD9' };

export const getBadge = type => BADGE[type] || DEFAULT_BADGE;

export const getTitle = (notification, actorName) => {
  switch (notification?.type) {
    case 'message': return `${actorName} te enviou uma mensagem`;
    case 'follow': return `${actorName} começou a seguir você`;
    case 'passport': return `${actorName} compartilhou um passaporte`;
    case 'comment': return `${actorName} comentou sua foto`;
    default:
      return notification?.message
        ? `${actorName} ${notification.message}`
        : 'Você tem uma notificação';
  }
};

/**
 * Resolve primeiro os destinos com FK tipada. O target_id legado continua como
 * fallback para notificações criadas antes da migração social.
 */
export const getRoute = notification => {
  const actor = notification?.actor;

  switch (notification?.type) {
    case 'message': {
      const conversationId = notification?.conversation_id || notification?.target_id;
      if (!conversationId) return null;
      return {
        name: 'Conversation',
        params: {
          conversationId,
          profile: actor || null,
          userId: actor?.id,
          username: actor?.username,
        },
      };
    }

    case 'passport': {
      const passportShareId = notification?.passport_share_id || notification?.target_id;
      if (!passportShareId) return null;
      return {
        name: 'PassportDetail',
        params: { passportShareId, passportId: passportShareId },
      };
    }

    case 'comment': {
      const photoId = notification?.photo_id || notification?.target_id;
      return photoId ? { name: 'PhotoDetail', params: { photoId } } : null;
    }

    case 'follow':
    default: {
      const userId = actor?.id || notification?.target_id;
      if (!userId) return null;
      return {
        name: 'PublicProfile',
        params: { userId, username: actor?.username },
      };
    }
  }
};

export const getNotificationDestination = (notification, actor) =>
  getRoute({ ...notification, actor: actor || notification?.actor || null });
