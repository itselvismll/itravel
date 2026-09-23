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
  // Destino do link de convite de viagem (Fase 2).
  'TripInvite',
]);

export const isRouteRegistered = routeName => REGISTERED_ROUTES.includes(routeName);

/**
 * As seções de dentro da tela da viagem que uma notificação sabe apontar.
 *
 * O nome é da SEÇÃO, não da aba. Quem manda o parâmetro sabe onde quer chegar
 * ("o bloco das tarefas do grupo"); qual aba desenha aquilo é decisão da tela,
 * em `AssistantResultScreen`. A diferença importa porque um aviso já enviado
 * carrega este valor no banco para sempre: se o bloco mudar de aba amanhã, a
 * tela passa a resolver diferente e os avisos antigos continuam certos.
 *
 * Constante, e não a string solta nos dois arquivos, porque um erro de digitação
 * aqui não quebra nada visivelmente — a tela só abriria na aba de sempre, e
 * ninguém ligaria as duas coisas.
 */
export const TRIP_SECTION = Object.freeze({
  groupTasks: 'group-tasks',
});

const BADGE = {
  message: { icon: 'chatbubble', color: '#FF9A00' },
  follow: { icon: 'checkmark', color: '#00D1C1' },
  passport: { icon: 'ribbon', color: '#6C2BD9' },
  comment: { icon: 'chatbubble-ellipses', color: '#FF4D6D' },
  like: { icon: 'heart', color: '#FF4D6D' },
  // Viagem colaborativa. O convite leva a cor da marca porque é ação PENDENTE —
  // ele pede algo de quem recebe; os outros dois apenas informam.
  trip_invite: { icon: 'airplane', color: '#6C2BD9' },
  trip_joined: { icon: 'person-add', color: '#00D1C1' },
  trip_edit: { icon: 'create', color: '#FF9A00' },
  // Tarefa: o mesmo desenho do checkbox da lista, para o aviso e o lugar onde
  // ele cai serem reconheciveis como a mesma coisa.
  trip_task_created: { icon: 'checkbox-outline', color: '#6C2BD9' },
  trip_task_done: { icon: 'checkbox', color: '#00D1C1' },
};

const DEFAULT_BADGE = { icon: 'notifications', color: '#6C2BD9' };

export const getBadge = type => BADGE[type] || DEFAULT_BADGE;

export const getTitle = (notification, actorName) => {
  switch (notification?.type) {
    case 'message': return `${actorName} te enviou uma mensagem`;
    case 'follow': return `${actorName} começou a seguir você`;
    case 'passport': return `${actorName} compartilhou um passaporte`;
    case 'comment': return `${actorName} comentou sua foto`;
    case 'like': return `${actorName} curtiu sua foto`;
    // O `preview` da notificação carrega o nome da viagem, então o título não
    // repete: "Fulano te convidou para uma viagem" / "Itália em outubro".
    case 'trip_invite': return `${actorName} te convidou para uma viagem`;
    case 'trip_joined': return `${actorName} entrou na sua viagem`;
    case 'trip_edit': return `${actorName} editou a viagem`;
    // O `preview` destas duas carrega o TÍTULO DA TAREFA, e não o nome da
    // viagem: "Elvis criou uma tarefa" / "Levar o adaptador de tomada".
    case 'trip_task_created': return `${actorName} criou uma tarefa`;
    case 'trip_task_done': return `${actorName} concluiu uma tarefa`;
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

    case 'comment':
    case 'like': {
      const photoId = notification?.photo_id || notification?.target_id;
      return photoId ? { name: 'PhotoDetail', params: { photoId } } : null;
    }

    // As três de viagem levam à MESMA tela: a viagem. `target_id` é o `trip_id`
    // (ver os triggers da migração 20260917130000).
    //
    // Inclusive o convite. Aceitar de dentro da viagem, e não de um botão na
    // lista de notificações, é o que permite decidir olhando o roteiro — que é a
    // informação de que a decisão depende. O convidado pendente já enxerga a
    // viagem (RLS `is_trip_member` não exige 'accepted'), então a tela abre.
    case 'trip_invite':
    case 'trip_joined':
    case 'trip_edit': {
      const tripId = notification?.trip_id || notification?.target_id;
      return tripId ? { name: 'AssistantResult', params: { planId: tripId } } : null;
    }

    // AS DE TAREFA ABREM A MESMA TELA, EM OUTRA ABA. A tarefa não tem tela
    // própria: ela mora no bloco "Tarefas do grupo", dentro da aba Checklist.
    // Sem `section`, tocar no aviso caía no roteiro e a pessoa tinha de achar
    // sozinha do que o aviso estava falando — que é o mesmo que não levar a
    // lugar nenhum.
    //
    // `section` e não `tab`: quem manda descreve ONDE quer chegar, e a tela
    // decide que aba isso é. Se o bloco um dia mudar de aba, muda a tela, e
    // nenhum aviso já enviado passa a apontar para o lugar errado.
    case 'trip_task_created':
    case 'trip_task_done': {
      const tripId = notification?.trip_id || notification?.target_id;
      return tripId
        ? { name: 'AssistantResult', params: { planId: tripId, section: TRIP_SECTION.groupTasks } }
        : null;
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
