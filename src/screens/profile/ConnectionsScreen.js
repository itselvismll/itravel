import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../components/Avatar';
import {
  getFollowerProfiles,
  getFollowingProfiles,
} from '../../services/followService';

export default function ConnectionsScreen({ route, navigation }) {
  const { userId, mode = 'followers' } = route.params;
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = mode === 'following'
      ? await getFollowingProfiles(userId)
      : await getFollowerProfiles(userId);
    setProfiles(result.data || []);
    if (!result.success) {
      setError('Não foi possível carregar esta lista.');
    }
    setLoading(false);
  }, [mode, userId]);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles])
  );

  const title = mode === 'following' ? 'Seguindo' : 'Seguidores';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Voltar"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#6C2BD9" />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity onPress={loadProfiles} style={styles.retryButton}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : profiles.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={42} color="#555a78" />
          <Text style={styles.emptyText}>
            {mode === 'following'
              ? 'Este perfil ainda não segue ninguém.'
              : 'Este perfil ainda não tem seguidores.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('PublicProfile', {
                userId: item.id,
                username: item.username,
              })}
            >
              <Avatar profile={item} size={46} />
              <View style={styles.profileText}>
                <Text style={styles.displayName}>
                  {item.display_name || item.username || 'Viajante'}
                </Text>
                {item.username ? (
                  <Text style={styles.username}>@{item.username}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#555a78" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1b1f3a',
  },
  backButton: { padding: 8 },
  title: {
    flex: 1,
    textAlign: 'center',
    color: '#F7F7F2',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSpacer: { width: 38 },
  loader: { marginTop: 48 },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1b1f3a',
  },
  profileText: { flex: 1, marginLeft: 12 },
  displayName: { color: '#F7F7F2', fontSize: 15, fontWeight: '600' },
  username: { color: '#9aa0c6', fontSize: 12, marginTop: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyText: { color: '#9aa0c6', textAlign: 'center', lineHeight: 20 },
  retryButton: {
    backgroundColor: '#6C2BD9',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },
});
