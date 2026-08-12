import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ShareCard from '../../components/ShareCard';
import { getPassportShare } from '../../services/messageService';

export default function PassportDetailScreen({ route, navigation }) {
  const { passportShareId, passportShare: initialShare } = route.params || {};
  const [share, setShare] = useState(initialShare || null);
  const [loading, setLoading] = useState(!initialShare);

  const load = useCallback(async () => {
    if (initialShare || !passportShareId) return;
    setLoading(true);
    const result = await getPassportShare(passportShareId);
    setShare(result.data || null);
    setLoading(false);
  }, [initialShare, passportShareId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const snapshot = share?.snapshot || share?.shared_passport || {};
  const profile = share?.sender || snapshot.profile || null;
  const visited = snapshot.visitedCountries || [];
  const wishlist = snapshot.wishlist || [];

  const visitedCodes = visited.map(country => country.country_code || country.code || country).filter(Boolean);
  const wishlistCodes = wishlist.map(country => country.country_code || country.code || country).filter(Boolean);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Passaporte recebido</Text>
        <View style={styles.spacer} />
      </View>
      {loading ? <ActivityIndicator color="#A78BFA" style={{ marginTop: 60 }} /> : !share ? (
        <View style={styles.empty}><Ionicons name="book-outline" size={48} color="#465070" /><Text style={styles.emptyTitle}>Passaporte indisponível</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.passportWrap}>
            <ShareCard
              profile={profile}
              avatarUrl={profile?.avatar_url}
              visitedCountryCodes={visitedCodes}
              wishlistCodes={wishlistCodes}
            />
          </ScrollView>
          <Text style={styles.date}>Compartilhado em {new Date(share.created_at || Date.now()).toLocaleDateString('pt-BR')}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#202744' },
  back: { padding: 8 },
  title: { flex: 1, color: '#fff', textAlign: 'center', fontSize: 17, fontWeight: '900' },
  spacer: { width: 38 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 18, gap: 14, paddingBottom: 50 },
  passportWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: '#8992B2', fontSize: 15, fontWeight: '700' },
  emptyText: { color: '#7E86A6', fontSize: 12, lineHeight: 18 },
  date: { color: '#6F7898', fontSize: 10, textAlign: 'center' },
});
