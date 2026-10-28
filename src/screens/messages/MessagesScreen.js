import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { getConversations } from '../../services/messageService';
import { useLocale } from '../../i18n/LocaleProvider';

// `t` entra por parâmetro, e não por hook: esta função é módulo, não
// componente — o hook só pode ser chamado de dentro de um.
const preview = (message, t) => message?.body || (
  message?.shared_photo ? t('messages.previews.photo')
    : message?.shared_plan ? t('messages.previews.plan')
      : message?.shared_passport ? t('messages.previews.passport')
        : t('messages.previews.empty')
);

export default function MessagesScreen({ navigation }) {
  const { t } = useLocale();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const result = await getConversations();
    setConversations(result.data || []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('messages.backLabel')}
        >
          <Ionicons name="arrow-back" size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('messages.title')}</Text>
          <Text style={styles.subtitle}>{t('messages.subtitle')}</Text>
        </View>
      </View>
      {loading ? <ActivityIndicator color="#6C2BD9" style={{ marginTop: 50 }} /> : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          contentContainerStyle={conversations.length ? styles.list : styles.emptyList}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="chatbubbles-outline" size={52} color="#3D4565" /><Text style={styles.emptyTitle}>{t('messages.empty.title')}</Text><Text style={styles.emptyText}>{t('messages.empty.text')}</Text></View>}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Conversation', { conversationId: item.id, profile: item.profile })}>
              <Avatar profile={item.profile} size={48} />
              <View style={{ flex: 1 }}><Text style={styles.name}>{item.profile?.display_name || item.profile?.username || t('messages.unnamed')}</Text><Text style={styles.preview} numberOfLines={1}>{preview(item.lastMessage, t)}</Text></View>
              <Ionicons name="chevron-forward" size={18} color="#626A89" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, paddingTop: 48, paddingBottom: 16 },
  backButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#7D85A5', fontSize: 11, marginTop: 3 },
  list: { padding: 12, gap: 8 },
  emptyList: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 15, backgroundColor: '#171D36', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  name: { color: '#F7F7F2', fontSize: 14, fontWeight: '800' },
  preview: { color: '#7F87A6', fontSize: 11, marginTop: 3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: '#F7F7F2', fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptyText: { color: '#747C9C', fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 300 },
});
