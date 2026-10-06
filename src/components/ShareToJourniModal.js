import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { getShareRecipients, shareWithUser } from '../services/messageService';
import { notify } from '../utils/dialogs';
import { INSTAGRAM_FEATURE_ENABLED } from '../utils/instagram';
import { useLocale } from '../i18n/LocaleProvider';

/**
 * `onInstagramShare` é opcional de propósito: quem chama decide se a opção faz
 * sentido naquela plataforma (o compartilhamento nos Stories é nativo, não tem
 * lado web). Sem a prop, a linha não é desenhada — o modal não testa Platform.
 *
 * O typedef existe porque props sem valor padrão são inferidas como
 * OBRIGATÓRIAS a partir da desestruturação, e o feed e o roteiro usam este modal
 * sem passar nenhuma das duas de compartilhamento externo.
 *
 * @param {{
 *   visible: boolean,
 *   onClose: () => void,
 *   resource: any,
 *   onExternalShare?: () => void,
 *   onInstagramShare?: () => void,
 * }} props
 */
export default function ShareToJourniModal({ visible, onClose, resource, onExternalShare, onInstagramShare }) {
  const { t } = useLocale();
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getShareRecipients().then(result => setRecipients(result.data || [])).finally(() => setLoading(false));
  }, [visible]);

  const share = async profile => {
    setSendingId(profile.id);
    const result = await shareWithUser(profile.id, resource);
    setSendingId(null);
    if (!result.success) {
      notify(t('shareToJourni.failedTitle'), ('error' in result && result.error) || t('common.actions.tryAgain'));
      return;
    }
    notify(t('shareToJourni.doneTitle'), t('shareToJourni.doneMessage', { name: profile.display_name || profile.username }));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}><Text style={styles.title}>{t('shareToJourni.title')}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#F7F7F2" /></TouchableOpacity></View>
          {/* Desativado por decisão de produto — ver INSTAGRAM_FEATURE_ENABLED
              em utils/instagram.js.

              A trava fica AQUI, e não em quem passa a prop, porque este é o
              ponto único por onde o botão aparece: um segundo chamador no futuro
              herda a flag sem precisar lembrar dela. */}
          {INSTAGRAM_FEATURE_ENABLED && !!onInstagramShare && (
            <TouchableOpacity
              style={styles.instagram}
              onPress={() => { onClose(); onInstagramShare(); }}
              accessibilityRole="button"
              accessibilityLabel={t('shareToJourni.instagramA11y')}
            >
              <Ionicons name="logo-instagram" size={21} color="#F7F7F2" />
              <View style={{ flex: 1 }}><Text style={styles.externalTitle}>{t('shareToJourni.instagramLabel')}</Text><Text style={styles.instagramSub}>{t('shareToJourni.instagramHint')}</Text></View>
              <Ionicons name="chevron-forward" size={18} color="rgba(247,247,242,0.7)" />
            </TouchableOpacity>
          )}
          {!!onExternalShare && (
            <TouchableOpacity style={styles.external} onPress={() => { onClose(); onExternalShare(); }}>
              <Ionicons name="share-social-outline" size={21} color="#A78BFA" />
              <View style={{ flex: 1 }}><Text style={styles.externalTitle}>{t('shareToJourni.otherApps')}</Text><Text style={styles.externalSub}>{t('shareToJourni.otherAppsHint')}</Text></View>
              <Ionicons name="chevron-forward" size={18} color="#777F9E" />
            </TouchableOpacity>
          )}
          <Text style={styles.sectionLabel}>{t('shareToJourni.friendsSection')}</Text>
          {loading ? <ActivityIndicator color="#A78BFA" style={{ margin: 28 }} /> : (
            <FlatList
              data={recipients}
              keyExtractor={item => item.id}
              ListEmptyComponent={<Text style={styles.empty}>{t('shareToJourni.emptyFriends')}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.person} onPress={() => share(item)} disabled={!!sendingId}>
                  <Avatar profile={item} size={42} />
                  <View style={{ flex: 1 }}><Text style={styles.name}>{item.display_name || item.username}</Text><Text style={styles.username}>@{item.username}</Text></View>
                  {sendingId === item.id ? <ActivityIndicator color="#A78BFA" /> : <Ionicons name="send" size={19} color="#A78BFA" />}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: { maxHeight: '78%', backgroundColor: '#151B33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 17 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: '#F7F7F2', fontSize: 18, fontWeight: '900' },
  external: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, backgroundColor: '#202744', borderRadius: 14, marginBottom: 16 },
  // Mesma forma da linha de "Outros aplicativos", com o roxo da marca em vez do
  // navy: é a mesma ação (sair do app), mas com destino certo em vez de escolha.
  instagram: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, backgroundColor: '#6C2BD9', borderRadius: 14, marginBottom: 10 },
  instagramSub: { color: 'rgba(247,247,242,0.72)', fontSize: 10, marginTop: 2 },
  externalTitle: { color: '#F7F7F2', fontSize: 13, fontWeight: '800' },
  externalSub: { color: '#7E86A6', fontSize: 10, marginTop: 2 },
  sectionLabel: { color: '#717998', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  person: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  name: { color: '#F7F7F2', fontSize: 13, fontWeight: '800' },
  username: { color: '#777F9E', fontSize: 10, marginTop: 2 },
  empty: { color: '#858DAD', textAlign: 'center', lineHeight: 19, padding: 26 },
});
