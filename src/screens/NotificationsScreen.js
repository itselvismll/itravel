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

const TYPE_ICON = {
  follow:  { name: 'person-add',    color: '#6C2BD9' },
  comment: { name: 'chatbubble',     color: '#0ea5e9' },
  like:    { name: 'heart',          color: '#ef4444' },
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) { setLoading(false); return; }

    const { data } = await supabase
      .from('notifications')
      .select('id, type, message, read, created_at, actor:actor_id(id, username, display_name, avatar_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setNotifications(data || []);
    setLoading(false);

    // mark all as read
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications().then(() => {}).catch(() => {});
      return undefined;
    }, [loadNotifications])
  );

  const renderItem = ({ item }) => {
    const icon = TYPE_ICON[item.type] || { name: 'notifications', color: '#6C2BD9' };
    const actor = item.actor;
    return (
      <View style={[styles.row, !item.read && styles.unread]}>
        <View style={styles.avatarWrap}>
          <Avatar profile={actor} size={44} />
          <View style={[styles.badge, { backgroundColor: icon.color }]}>
            <Ionicons name={icon.name} size={11} color="white" />
          </View>
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.message}>
            <Text style={styles.bold}>{actor?.display_name || actor?.username || 'Alguém'}</Text>
            {' '}{item.message}
          </Text>
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notificações</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>Nenhuma notificação ainda</Text>
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
    borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0D1326' },
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
  bold: { fontWeight: '700' },
  time: { fontSize: 12, color: '#999', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15, color: '#999' },
});
