import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { getCurrentUser } from '../../services/supabase';
import { getConversationMessages, markConversationRead, sendMessage } from '../../services/messageService';
import { openPostgresChangesChannel } from '../../services/realtimeChannel';

export default function ConversationScreen({ route, navigation }) {
  const { conversationId, profile } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [userId, setUserId] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [user, result] = await Promise.all([getCurrentUser(), getConversationMessages(conversationId)]);
    setUserId(user?.id || null);
    setMessages(result.data || []);
    await markConversationRead(conversationId);
    setLoading(false);
  }, [conversationId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!conversationId || conversationId.startsWith('local-conversation-')) return undefined;

    // Este efeito se re-inscreve sozinho em uso normal: `userId` chega depois do
    // primeiro render (vem do load()), e a troca de null para o id roda a
    // limpeza e o efeito no mesmo commit — o mesmo encontro que apagava o Feed.
    // Ver o cabeçalho de services/realtimeChannel.js.
    return openPostgresChangesChannel({
      topic: `conversation-${conversationId}`,
      listeners: [
        {
          filter: {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          handler: payload => {
            const incoming = payload.new;
            setMessages(current => (
              current.some(message => message.id === incoming.id)
                ? current
                : [...current, incoming]
            ));
            if (incoming.sender_id !== userId) markConversationRead(conversationId);
          },
        },
      ],
    });
  }, [conversationId, userId]);

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const result = await sendMessage(conversationId, { body: text });
    if (result.success) { setMessages(current => [...current, result.data]); setText(''); }
    setSending(false);
  };

  const openShared = message => {
    if (message.shared_photo?.id) navigation.navigate('PhotoDetail', { photoId: message.shared_photo.id });
    else if (message.shared_plan) navigation.navigate('AssistantResult', { request: message.shared_plan.request, plan: message.shared_plan.plan });
    else if (message.shared_passport) navigation.navigate('PassportDetail', {
      passportShareId: message.shared_passport_id,
      passportShare: {
        id: message.shared_passport_id,
        snapshot: message.shared_passport,
        sender: message.shared_passport?.profile || profile,
        created_at: message.created_at,
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}><Ionicons name="arrow-back" size={22} color="#fff" /></TouchableOpacity>
        <Avatar profile={profile} size={38} />
        <View style={{ flex: 1 }}><Text style={styles.name}>{profile?.display_name || profile?.username || 'Viajante'}</Text><Text style={styles.handle}>@{profile?.username || 'viajante'}</Text></View>
      </View>
      {loading ? <ActivityIndicator color="#A78BFA" style={{ marginTop: 50 }} /> : (
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                {!!item.shared_photo && <TouchableOpacity onPress={() => openShared(item)}><Image source={{ uri: item.shared_photo.photo_url }} style={styles.sharedImage} /><Text style={styles.sharedTitle}>Ver publicação</Text></TouchableOpacity>}
                {!!item.shared_plan && <TouchableOpacity style={styles.planCard} onPress={() => openShared(item)}><Ionicons name="map-outline" size={23} color="#A78BFA" /><View style={{ flex: 1 }}><Text style={styles.planTitle}>{item.shared_plan.plan?.title || 'Roteiro Journi'}</Text><Text style={styles.planSub}>Abrir roteiro compartilhado</Text></View></TouchableOpacity>}
                {!!item.shared_passport && <TouchableOpacity style={styles.planCard} onPress={() => openShared(item)}><Ionicons name="book-outline" size={23} color="#00D1C1" /><View style={{ flex: 1 }}><Text style={styles.planTitle}>Passaporte Journi</Text><Text style={styles.passportSub}>Abrir passaporte compartilhado</Text></View></TouchableOpacity>}
              </View>
            );
          }}
        />
      )}
      <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Mensagem..." placeholderTextColor="#6E7694" style={styles.input} multiline /><TouchableOpacity style={styles.send} onPress={submit}>{sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={19} color="#fff" />}</TouchableOpacity></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 72, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: '#202744' },
  back: { padding: 7 },
  name: { color: '#fff', fontSize: 14, fontWeight: '800' },
  handle: { color: '#737B9A', fontSize: 10, marginTop: 1 },
  messages: { padding: 13, gap: 8, paddingBottom: 22 },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 11 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#6C2BD9', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#202744', borderBottomLeftRadius: 4 },
  body: { color: '#fff', fontSize: 13, lineHeight: 19 },
  sharedImage: { width: 220, maxWidth: '100%', aspectRatio: 4 / 3, borderRadius: 10 },
  sharedTitle: { color: '#fff', fontWeight: '800', fontSize: 11, marginTop: 7 },
  planCard: { width: 230, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, padding: 8 },
  planTitle: { color: '#fff', fontSize: 12, fontWeight: '800' },
  planSub: { color: '#C7B8FA', fontSize: 9, marginTop: 2 },
  passportSub: { color: '#66E6DC', fontSize: 9, marginTop: 2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 11, borderTopWidth: 1, borderTopColor: '#202744' },
  input: { flex: 1, minHeight: 44, maxHeight: 110, backgroundColor: '#202744', color: '#fff', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center' },
});
