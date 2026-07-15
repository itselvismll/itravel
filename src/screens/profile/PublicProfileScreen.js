import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { followUser, unfollowUser, getFollowing, getFollowCounts } from '../../services/followService';
import { getFlagEmoji } from '../../utils/flagUtils';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 4) / 3;

const LEVELS = [
  { min: 0,  max: 2,   name: 'Iniciante',       emoji: '🌱' },
  { min: 3,  max: 5,   name: 'Viajante',        emoji: '🧳' },
  { min: 6,  max: 10,  name: 'Explorador',      emoji: '🧭' },
  { min: 11, max: 20,  name: 'Globetrotter',    emoji: '🌍' },
  { min: 21, max: 999, name: 'Lenda Viajante',  emoji: '👑' },
];

const getLevel = (count) =>
  LEVELS.find(l => count >= l.min && count <= l.max) || LEVELS[0];

export default function PublicProfileScreen({ route, navigation }) {
  const { userId, username } = route.params;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [visitedCountries, setVisitedCountries] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => { loadProfile(); }, [userId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const myId = user?.id;
      setCurrentUserId(myId);

      const [profileRes, countriesRes, photosRes, followCountsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('visited_countries')
          .select('country_code, country_name')
          .eq('user_id', userId),
        supabase.from('country_photos')
          .select('id, photo_url, city, country_code, rating, review, location_name')
          .eq('user_id', userId)
          .eq('is_public', true)
          .order('created_at', { ascending: false })
          .limit(12),
        getFollowCounts(userId),
      ]);

      setProfile(profileRes.data);
      setVisitedCountries(countriesRes.data || []);
      setPhotos(photosRes.data || []);
      setFollowCounts(followCountsRes);

      if (myId && myId !== userId) {
        const followingRes = await getFollowing(myId);
        setIsFollowing(
          followingRes.success && Array.isArray(followingRes.data) && followingRes.data.includes(userId)
        );
      }
    } catch (e) {
      console.error('Erro ao carregar perfil público:', e);
    }
    setLoading(false);
  };

  const toggleFollow = async () => {
    if (!currentUserId) return;
    if (isFollowing) {
      await unfollowUser(currentUserId, userId);
      setIsFollowing(false);
      setFollowCounts(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
    } else {
      await followUser(currentUserId, userId);
      setIsFollowing(true);
      setFollowCounts(prev => ({ ...prev, followers: prev.followers + 1 }));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6C2BD9" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
        </TouchableOpacity>
        <Text style={{ color: '#9aa0c6', marginTop: 16 }}>Perfil não encontrado</Text>
      </View>
    );
  }

  const level = getLevel(visitedCountries.length);
  const isOwnProfile = currentUserId === userId;

  return (
    <View style={{ flex: 1, backgroundColor: '#0D1326' }}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color="#F7F7F2" />
      </TouchableOpacity>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.avatarRing, isFollowing && styles.avatarRingActive]}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>
                  {(profile.username || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.displayName}>{profile.display_name || profile.username}</Text>
          <Text style={styles.username}>@{profile.username}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{visitedCountries.length}</Text>
              <Text style={styles.statLabel}>Países</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{photos.length}</Text>
              <Text style={styles.statLabel}>Fotos</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{followCounts.followers}</Text>
              <Text style={styles.statLabel}>Seguidores</Text>
            </View>
          </View>

          {!isOwnProfile && (
            <TouchableOpacity
              onPress={toggleFollow}
              style={[styles.followBtn, isFollowing && styles.followingBtn]}
            >
              <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                {isFollowing ? 'Seguindo ✓' : 'Seguir'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Nível */}
        <View style={styles.section}>
          <View style={styles.levelCard}>
            <Text style={styles.levelEmoji}>{level.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.levelName}>{level.name}</Text>
              <Text style={styles.levelSub}>{visitedCountries.length} países visitados</Text>
            </View>
          </View>
        </View>

        {/* Países visitados */}
        {visitedCountries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PAÍSES VISITADOS</Text>
            <View style={styles.flagGrid}>
              {visitedCountries.map((c, i) => (
                <Text key={i} style={styles.flagEmoji}>
                  {getFlagEmoji(c.country_code)}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Fotos públicas */}
        {photos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FOTOS</Text>
            <View style={styles.photoGrid}>
              {photos.map((photo, i) => (
                <TouchableOpacity key={i} onPress={() => setSelectedPhoto(photo)}>
                  <Image source={{ uri: photo.photo_url }} style={styles.photoThumb} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Modal foto ampliada */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedPhoto(null)}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          {selectedPhoto && (
            <View style={styles.modalCard}>
              <Image
                source={{ uri: selectedPhoto.photo_url }}
                style={styles.modalPhoto}
                resizeMode="cover"
              />
              <View style={{ padding: 14 }}>
                {selectedPhoto.location_name && (
                  <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6, alignItems: 'center' }}>
                    <Ionicons name="location-outline" size={13} color="#6C2BD9" />
                    <Text style={{ fontSize: 12, color: '#9aa0c6' }}>
                      {selectedPhoto.location_name}
                    </Text>
                  </View>
                )}
                {selectedPhoto.review && (
                  <Text style={{ fontSize: 13, color: '#F7F7F2', fontStyle: 'italic' }}>
                    "{selectedPhoto.review}"
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0D1326',
  },
  backBtn: {
    position: 'absolute', top: 48, left: 16, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, padding: 8,
  },
  header: { alignItems: 'center', padding: 24, paddingTop: 88 },
  avatarRing: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: '#2a2f50',
    marginBottom: 12, overflow: 'hidden',
  },
  avatarRingActive: { borderColor: '#6C2BD9', borderWidth: 3 },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    backgroundColor: '#6C2BD9',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { color: 'white', fontSize: 32, fontWeight: '700' },
  displayName: { fontSize: 20, fontWeight: '700', color: '#F7F7F2', marginBottom: 4 },
  username: { fontSize: 13, color: '#9aa0c6', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 20 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#FF9A00' },
  statLabel: { fontSize: 10, color: '#9aa0c6', marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#2a2f50' },
  followBtn: {
    paddingVertical: 10, paddingHorizontal: 44,
    borderRadius: 24, backgroundColor: '#6C2BD9',
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: '#6C2BD9',
  },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followingBtnText: { color: '#6C2BD9' },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#9aa0c6',
    letterSpacing: 2, marginBottom: 12,
  },
  levelCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1b1f3a', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  levelEmoji: { fontSize: 28 },
  levelName: { fontSize: 15, fontWeight: '700', color: '#F7F7F2' },
  levelSub: { fontSize: 11, color: '#9aa0c6', marginTop: 2 },
  flagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flagEmoji: { fontSize: 28 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  photoThumb: { width: PHOTO_SIZE, height: PHOTO_SIZE },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center', padding: 20,
  },
  modalClose: {
    position: 'absolute', top: 50, right: 24, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6,
  },
  modalCard: { backgroundColor: '#1b1f3a', borderRadius: 16, overflow: 'hidden' },
  modalPhoto: { width: '100%', aspectRatio: 1 },
});
