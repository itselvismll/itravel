import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, getCurrentUser } from '../services/supabase';
import { COLORS } from '../utils/constants';
import Avatar from '../components/Avatar';
import { getBadge, getNotificationDestination, getPredicate } from '../utils/notificationRouting';
import { NOTIFICATION_TYPES } from '../utils/socialNotifications';
import { useLocale } from '../i18n/LocaleProvider';

// O TYPE_ICON local saiu daqui.
//
// Ele tinha TRÊS tipos (follow, comment, like) enquanto o app tem dez, então
// convite de viagem, tarefa, mensagem e passaporte caíam todos no mesmo sininho
// roxo genérico — e o banner, que sempre usou `getBadge`, mostrava o ícone certo
// para os mesmos avisos. Duas tabelas de ícone para a mesma coisa é como se
// chega nisso: a segunda não acompanha quando um tipo novo nasce.
//
// Agora as duas telas leem `getBadge`, que cobre os dez e tem o `DEFAULT_BADGE`
// para o décimo primeiro.

// O tempo relativo. As unidades vêm de chave porque "min"/"h"/"d" não são
// universais — em inglês o padrão é "m"/"h"/"d", e "agora" é "now".
const timeAgo = (dateStr, t) => {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return t('common.time.now');
  if (diff < 3600) return t('common.time.minutesShort', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('common.time.hoursShort', { count: Math.floor(diff / 3600) });
  return t('common.time.daysShort', { count: Math.floor(diff / 86400) });
};

export default function NotificationsScreen({ navigation }) {
  const { t } = useLocale();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError('');
    const user = await getCurrentUser();
    if (!user) { setLoading(false); return; }

    // `target_id` é o destino genérico, e o ÚNICO caminho até a viagem: os
    // triggers de colaboração gravam o `trip_id` ali (`notifications` não tem
    // coluna `trip_id`). Sem pedir essa coluna, `getNotificationDestination`
    // devolve null para trip_invite/trip_joined/trip_edit e a notificação vira
    // um item que aparece na lista e não responde ao toque — foi assim que
    // chegou à produção. Nada de comentário DENTRO do select: o texto vai
    // inteiro para o PostgREST. Ver tests/notification-routing.test.cjs.
    const { data, error: loadError } = await supabase
      .from('notifications')
      .select(`
        id,
        type,
        message,
        read,
        created_at,
        actor_id,
        photo_id,
        conversation_id,
        passport_share_id,
        target_id,
        preview,
        actor:actor_id(id, username, display_name, avatar_url)
      `)
      .eq('user_id', user.id)
      .in('type', NOTIFICATION_TYPES)
      .order('created_at', { ascending: false })
      .limit(50);

    if (loadError) {
      setNotifications([]);
      setError(t('notifications.loadFailed'));
      setLoading(false);
      return;
    }

    // A deduplicação da TELA, que é diferente do agrupamento do banco: ela existe
    // para esconder linhas repetidas que sobraram de triggers antigos.
    //
    // O ALVO É O MAIS ESPECÍFICO QUE A LINHA TIVER, e a ordem importa:
    //
    //   `photo_id`           comentário e curtida;
    //   `passport_share_id`  cada passaporte é um aviso próprio — dois do mesmo
    //                        remetente na mesma conversa têm tipo, ator, texto e
    //                        `conversation_id` iguais, e o segundo sumiria;
    //   `conversation_id`    mensagem direta, agrupada por conversa — sem ele,
    //                        duas conversas da MESMA PESSOA colapsariam numa só.
    //
    // Começar pelo menos específico apagaria linhas distintas da tela.
    const unique = new Map();
    (data || []).forEach(item => {
      const target = item.photo_id || item.passport_share_id || item.conversation_id || '';
      const key = `${item.type}:${item.actor_id || ''}:${target}:${item.message}`;
      if (!unique.has(key)) unique.set(key, item);
    });
    setNotifications([...unique.values()]);
    setLoading(false);

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .in('type', NOTIFICATION_TYPES)
      .eq('read', false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
      return undefined;
    }, [loadNotifications])
  );

  const renderItem = ({ item }) => {
    const icon = getBadge(item.type);
    const actor = Array.isArray(item.actor) ? item.actor[0] : item.actor;
    const destination = getNotificationDestination(item, actor);
    const handlePress = () => {
      if (destination) navigation.navigate(destination.name, destination.params);
    };

    return (
      <TouchableOpacity
        style={[styles.row, !item.read && styles.unread]}
        disabled={!destination}
        onPress={handlePress}
      >
        <View style={styles.avatarWrap}>
          <Avatar profile={actor} size={44} />
          <View style={[styles.badge, { backgroundColor: icon.color }]}>
            <Ionicons name={icon.icon} size={11} color="white" />
          </View>
        </View>
        <View style={styles.textWrap}>
          {/* O PREDICADO vem do app, não do `item.message` do banco.
              O nome fica em negrito e o predicado em peso normal, que é por que
              a chave guarda só o predicado — ver NOTIFICATION_PREDICATE_KEY em
              utils/notificationRouting. */}
          <Text style={styles.message}>
            <Text style={styles.bold}>{actor?.display_name || actor?.username || t('common.someone')}</Text>
            {' '}{getPredicate(item, t)}
          </Text>
          {!!item.preview && <Text style={styles.preview} numberOfLines={1}>{item.preview}</Text>}
          <Text style={styles.time}>{timeAgo(item.created_at, t)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel={t('common.actions.back')}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color="#0D1326" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('notifications.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity onPress={loadNotifications} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('notifications.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>{t('notifications.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    paddingTop: 50, paddingHorizontal: 16, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0',
  },
  backButton: { padding: 6 },
  headerSpacer: { width: 34 },
  title: {
    flex: 1, textAlign: 'center',
    fontSize: 20, fontWeight: '700', color: '#0D1326',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#f5f5f5',
  },
  unread: { backgroundColor: '#f9f5ff' },
  avatarWrap: { position: 'relative', marginRight: 12 },
  badge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  textWrap: { flex: 1 },
  message: { fontSize: 14, color: '#333', lineHeight: 20 },
  preview: { fontSize: 12, color: '#777', marginTop: 2 },
  bold: { fontWeight: '700' },
  time: { fontSize: 12, color: '#999', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: '#999' },
  retryButton: {
    backgroundColor: '#6C2BD9', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },
});
