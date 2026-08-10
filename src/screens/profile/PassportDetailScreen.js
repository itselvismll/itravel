import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import CountryFlag from '../../components/CountryFlag';
import { getPassportShare } from '../../services/messageService';
import { getAlpha2, getCountryNamePtByCode } from '../../utils/countryUtils';

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

  const renderCountries = (items, emptyText) => items.length ? (
    <View style={styles.grid}>
      {items.map((country, index) => {
        const code = country.country_code || country.code || country;
        const name = country.country_name || country.name;
        return (
          <View key={`${code}-${index}`} style={styles.stamp}>
            <CountryFlag countryCode={code} width={32} height={21} borderRadius={3} />
            <Text style={styles.countryCode}>{getAlpha2(code).toUpperCase()}</Text>
            <Text style={styles.countryName} numberOfLines={1}>{getCountryNamePtByCode(code, name)}</Text>
          </View>
        );
      })}
    </View>
  ) : <Text style={styles.emptyText}>{emptyText}</Text>;

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
          <View style={styles.owner}>
            <Avatar profile={profile} size={58} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerName}>{profile?.display_name || profile?.username || 'Viajante'}</Text>
              {!!profile?.username && <Text style={styles.username}>@{profile.username}</Text>}
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>PASSAPORTE</Text>
            {renderCountries(visited, 'Nenhum país visitado neste passaporte.')}
          </View>
          <View style={styles.card}>
            <Text style={[styles.label, styles.wishlistLabel]}>QUERO VISITAR</Text>
            {renderCountries(wishlist, 'Nenhum destino na lista de desejos.')}
          </View>
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
  owner: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 16, borderRadius: 18, backgroundColor: '#171D36' },
  ownerName: { color: '#F7F7F2', fontSize: 17, fontWeight: '900' },
  username: { color: '#858DAD', fontSize: 11, marginTop: 3 },
  card: { borderRadius: 18, backgroundColor: '#171D36', padding: 16 },
  label: { color: '#A78BFA', fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 13 },
  wishlistLabel: { color: '#00D1C1' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stamp: { width: 112, minHeight: 92, padding: 10, borderRadius: 13, backgroundColor: '#EEE7D5', alignItems: 'center', justifyContent: 'center' },
  countryCode: { color: '#171D36', fontSize: 17, fontWeight: '900', marginTop: 5 },
  countryName: { color: '#5D513A', fontSize: 9, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { color: '#8992B2', fontSize: 15, fontWeight: '700' },
  emptyText: { color: '#7E86A6', fontSize: 12, lineHeight: 18 },
  date: { color: '#6F7898', fontSize: 10, textAlign: 'center' },
});
