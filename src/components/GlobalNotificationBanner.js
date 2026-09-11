import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { navigateFromOutside } from '../navigation/navigationRef';
import { getRoute, isRouteRegistered } from '../utils/notificationRouting';
import NotificationBanner from './NotificationBanner';
import { isSocialNotification } from '../utils/socialNotifications';
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

  // --- Realtime -------------------------------------------------------------
  useEffect(() => {
    if (!userId) {
      setQueue([]);
      setCurrent(null);
      return undefined;
    }

    let cancelled = false;

    const enqueue = async (row) => {
      if (!row || !isSocialNotification(row)) return;

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
      setQueue(prev => (
        prev.some(item => item.id === row.id) ? prev : [...prev, { ...row, actor }]
      ));
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
