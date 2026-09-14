import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import { getCurrentUser } from '../../services/supabase';
import {
  getConversationMessages,
  isConversationAvailable,
  markConversationRead,
  sendMessage,
} from '../../services/messageService';
import ReportSheet from '../../components/ReportSheet';
import { openPostgresChangesChannel } from '../../services/realtimeChannel';

export default function ConversationScreen({ route, navigation }) {
  const { conversationId, profile } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [userId, setUserId] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [indisponivel, setIndisponivel] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const load = useCallback(async () => {
    // A conversa é checada à parte das mensagens: lista vazia sozinha não diz se
    // a conversa é nova ou se sumiu por bloqueio. Ver isConversationAvailable.
    const [user, result, disponivel] = await Promise.all([
      getCurrentUser(),
      getConversationMessages(conversationId),
      isConversationAvailable(conversationId),
    ]);
    setUserId(user?.id || null);
    setMessages(result.data || []);
    setIndisponivel(!disponivel);
    if (disponivel) await markConversationRead(conversationId);
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
        {/* Denunciar o perfil fica no cabeçalho, visível; denunciar UMA mensagem
            fica no toque longo da bolha, que é a convenção de todo app de
            mensagem. Os dois caminhos existem porque são denúncias diferentes:
            uma é sobre a pessoa, a outra sobre o que ela escreveu. */}
        {!!profile?.id && !indisponivel && (
          <TouchableOpacity
            style={styles.back}
            onPress={() => setReportTarget({ type: 'profile', id: profile.id })}
            accessibilityRole="button"
            accessibilityLabel="Denunciar perfil"
          >
            <Ionicons name="flag-outline" size={19} color="#8A90A6" />
          </TouchableOpacity>
        )}
      </View>
      {loading ? <ActivityIndicator color="#A78BFA" style={{ marginTop: 50 }} /> : indisponivel ? (
        <View style={styles.unavailable}>
          <Ionicons name="chatbubble-ellipses-outline" size={40} color="#3A4166" />
          <Text style={styles.unavailableTitle}>Esta conversa não está disponível</Text>
          <Text style={styles.unavailableText}>
            Ela pode ter sido encerrada ou não estar mais acessível para você.
          </Text>
          <TouchableOpacity style={styles.unavailableBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.unavailableBtnText}>Voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messages}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            return (
              <TouchableOpacity
                activeOpacity={mine ? 1 : 0.85}
                onLongPress={mine ? undefined : () => setReportTarget({ type: 'message', id: item.id })}
                delayLongPress={350}
                accessibilityLabel={mine ? undefined : 'Segure para denunciar esta mensagem'}
                style={[styles.bubble, mine ? styles.mine : styles.theirs]}
              >
                {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                {!!item.shared_photo && <TouchableOpacity onPress={() => openShared(item)}><Image source={{ uri: item.shared_photo.photo_url }} style={styles.sharedImage} /><Text style={styles.sharedTitle}>Ver publicação</Text></TouchableOpacity>}
                {!!item.shared_plan && <TouchableOpacity style={styles.planCard} onPress={() => openShared(item)}><Ionicons name="map-outline" size={23} color="#A78BFA" /><View style={{ flex: 1 }}><Text style={styles.planTitle}>{item.shared_plan.plan?.title || 'Roteiro Journi'}</Text><Text style={styles.planSub}>Abrir roteiro compartilhado</Text></View></TouchableOpacity>}
                {!!item.shared_passport && <TouchableOpacity style={styles.planCard} onPress={() => openShared(item)}><Ionicons name="book-outline" size={23} color="#00D1C1" /><View style={{ flex: 1 }}><Text style={styles.planTitle}>Passaporte Journi</Text><Text style={styles.passportSub}>Abrir passaporte compartilhado</Text></View></TouchableOpacity>}
              </TouchableOpacity>
            );
          }}
        />
      )}
      {!indisponivel && <View style={styles.composer}><TextInput value={text} onChangeText={setText} placeholder="Mensagem..." placeholderTextColor="#6E7694" style={styles.input} multiline /><TouchableOpacity style={styles.send} onPress={submit}>{sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={19} color="#fff" />}</TouchableOpacity></View>}

      <ReportSheet
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.type || 'message'}
        targetId={reportTarget?.id}
      />
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
  unavailable: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 9 },
  unavailableTitle: { color: '#D6DAEA', fontSize: 15, fontWeight: '600', marginTop: 4 },
  unavailableText: { color: '#5A6180', fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  unavailableBtn: { marginTop: 10, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#A78BFA' },
  unavailableBtnText: { color: '#A78BFA', fontSize: 13, fontWeight: '600' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 11, borderTopWidth: 1, borderTopColor: '#202744' },
  input: { flex: 1, minHeight: 44, maxHeight: 110, backgroundColor: '#202744', color: '#fff', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center' },
});
