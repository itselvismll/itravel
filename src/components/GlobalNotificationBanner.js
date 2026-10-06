import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { navigateFromOutside } from '../navigation/navigationRef';
import { getRoute, isRouteRegistered } from '../utils/notificationRouting';
import NotificationBanner from './NotificationBanner';
import { isKnownNotification } from '../utils/socialNotifications';
import { openPostgresChangesChannel } from '../services/realtimeChannel';

const VISIBLE_FOR_MS = 2500;
// Respiro entre um banner e o próximo, para a saída de um não colidir com a entrada do
// seguinte quando chegam várias notificações em rajada.
const GAP_BETWEEN_BANNERS_MS = 260;

/**
 * Componente global: escuta a tabela de notificações em tempo real e apresenta um banner
 * por vez, por cima de qualquer tela. Renderiza como irmão do <NavigationContainer>.
 *
 * @param {object} props
 * @param {string|null} props.userId usuário logado; sem ele nada é assinado
 * @param {boolean} props.suppressed pausa a fila (o Modal de upload cobre o banner no nativo)
 */
export default function GlobalNotificationBanner({ userId, suppressed = false }) {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const cooldownRef = useRef(null);

  // Que notificação está na tela AGORA, para o `enqueue` saber sem depender de
  // `current`. Ele vive dentro do efeito de inscrição, que roda só quando o
  // usuário muda: ler `current` de lá pegaria o valor de quando o canal foi
  // aberto, que é null para sempre. O updater de `setCurrent` resolve o caso de
  // trocar o conteúdo, mas o de `setQueue` precisa saber se a linha já está na
  // tela para não devolvê-la à fila.
  const jaVisivelRef = useRef(null);
  jaVisivelRef.current = current?.id ?? null;

  // --- Realtime -------------------------------------------------------------
  useEffect(() => {
    if (!userId) {
      setQueue([]);
      setCurrent(null);
      return undefined;
    }

    let cancelled = false;

    const enqueue = async (row, { isUpdate = false } = {}) => {
      if (!row || !isKnownNotification(row)) return;

      // UPDATE em notificação JÁ LIDA não é aviso novo: é o próprio app marcando
      // como lida. Abrir a tela de notificações marca TODAS de uma vez, e sem esta
      // guarda aquele update viraria uma rajada de banners de coisas que a pessoa
      // acabou de ler.
      if (isUpdate && row.read) return;

      // O payload de postgres_changes traz só a linha crua, sem join. O perfil do autor é
      // buscado à parte para o banner ter avatar e nome.
      let actor = null;
      if (row.actor_id) {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', row.actor_id)
          .maybeSingle();
        actor = data || null;
      }

      if (cancelled) return;

      const enriquecida = { ...row, actor, bumpedAt: Date.now() };

      // A MESMA NOTIFICAÇÃO JÁ ESTÁ NA TELA: troca o conteúdo em vez de empilhar
      // um segundo banner. É o caso da segunda mensagem da mesma conversa, que o
      // trigger resolve atualizando a linha — o `id` chega igual. Empilhar aqui
      // mostraria dois banners seguidos dizendo a mesma coisa, com o resumo novo
      // só no segundo.
      //
      // `bumpedAt` muda a cada chegada e é o que faz o NotificationBanner rearmar
      // a contagem de saída sem repetir a animação de entrada.
      setCurrent(atual => (atual && atual.id === row.id ? enriquecida : atual));

      setQueue(prev => {
        const indice = prev.findIndex(item => item.id === row.id);
        // Na fila, o conteúdo mais novo substitui o antigo na MESMA posição: a
        // notificação não deve furar a ordem de chegada só porque foi atualizada.
        if (indice >= 0) {
          const copia = [...prev];
          copia[indice] = enriquecida;
          return copia;
        }
        // Já está na tela: não volta para a fila.
        if (jaVisivelRef.current === row.id) return prev;
        return [...prev, enriquecida];
      });
    };

    // Pelo helper, e não por supabase.channel() direto: trocar de conta (ou
    // sair e entrar) refaz esta inscrição no mesmo tópico enquanto a saída da
    // anterior ainda está em curso, e aí `channel()` devolveria o canal já
    // inscrito e o `.on()` lançaria. Ver services/realtimeChannel.js.
    //
    // O erro aqui seria pior do que no Feed: este componente é irmão do
    // NavigationContainer, então a árvore que ele derrubaria é o app inteiro —
    // e não há boundary de tela que o alcance.
    const closeChannel = openPostgresChangesChannel({
      topic: `notifications:${userId}`,
      listeners: [
        {
          filter: {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          handler: (payload) => { enqueue(payload.new); },
        },
        // UPDATE TAMBÉM, e não só INSERT. O trigger de mensagem direta agrupa por
        // conversa atualizando a linha existente (migração 20260930120000), então
        // da segunda mensagem em diante não há INSERT nenhum. Sem este ouvinte, o
        // banner só apareceria para a primeira mensagem de cada conversa — e o
        // banner é o ÚNICO alerta em tempo real do app, porque não existe push
        // nativo. Mensagem que não aparece aqui passa invisível.
        //
        // O custo é ouvir todo update desta tabela para este usuário, inclusive o
        // "marcar como lida". O `isUpdate` existe para descartá-los.
        {
          filter: {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          handler: (payload) => { enqueue(payload.new, { isUpdate: true }); },
        },
      ],
    });

    return () => {
      // O `cancelled` continua sendo desta limpeza: ele barra o setQueue de um
      // enqueue que já estava buscando o perfil do autor quando o efeito caiu.
      cancelled = true;
      closeChannel();
    };
  }, [userId]);

  // --- Fila: um banner por vez ---------------------------------------------
  useEffect(() => {
    // Enquanto suprimido a fila só acumula — nada é descartado.
    if (suppressed || current || queue.length === 0) return;

    setCurrent(queue[0]);
    setQueue(prev => prev.slice(1));
  }, [queue, current, suppressed]);

  // Se o upload abrir com um banner na tela, ele volta para a frente da fila em vez de
  // ser perdido atrás do Modal.
  useEffect(() => {
    if (!suppressed || !current) return;
    setQueue(prev => [current, ...prev]);
    setCurrent(null);
  }, [suppressed, current]);

  useEffect(() => () => {
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
  }, []);

  const releaseCurrent = useCallback(() => {
    setCurrent(null);
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
  }, []);

  const handleHidden = useCallback(() => {
    // Segura a próxima por um instante para os banners não se atropelarem.
    cooldownRef.current = setTimeout(releaseCurrent, GAP_BETWEEN_BANNERS_MS);
  }, [releaseCurrent]);

  const handlePress = useCallback(() => {
    const notification = current;
    if (!notification) return;

    releaseCurrent();

    if (notification.id) {
      // Marcar como lida não pode atrapalhar a navegação: dispara e ignora o resultado
      // (o segundo callback evita unhandled rejection se a rede falhar).
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notification.id)
        .then(() => {}, () => {});
    }

    const route = getRoute(notification);
    if (route && isRouteRegistered(route.name)) {
      navigateFromOutside(route.name, route.params);
    }
  }, [current, releaseCurrent]);

  if (!userId || !current) return null;

  return (
    <NotificationBanner
      notification={current}
      onPress={handlePress}
      onHidden={handleHidden}
      visibleForMs={VISIBLE_FOR_MS}
    />
  );
}
