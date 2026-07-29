import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import {
  followUser,
  getFollowCounts,
  getFollowing,
  unfollowUser,
} from '../../services/followService';
import { getPhotoCommentCounts } from '../../services/photoService';
import CountryFlag from '../../components/CountryFlag';
import Avatar from '../../components/Avatar';
import StarRating from '../../components/StarRating';

const LEVELS = [
  { min: 0, max: 2, name: 'Iniciante', emoji: '🌱' },
  { min: 3, max: 5, name: 'Viajante', emoji: '🧳' },
  { min: 6, max: 10, name: 'Explorador', emoji: '🧭' },
  { min: 11, max: 20, name: 'Globetrotter', emoji: '🌍' },
  { min: 21, max: Number.POSITIVE_INFINITY, name: 'Lenda Viajante', emoji: '👑' },
];

const getLevel = (count) =>
  LEVELS.find((level) => count >= level.min && count <= level.max) || LEVELS[0];

export default function PublicProfileScreen({ route, navigation }) {
  const { userId } = route.params;
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [visitedCountries, setVisitedCountries] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      setLoading(true);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        const myId = user?.id;

        const [profileRes, countriesRes, photosRes, followCountsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase
            .from('visited_countries')
            .select('country_code, country_name')
            .eq('user_id', userId),
          supabase
            .from('country_photos')
            .select(`
              id,
              user_id,
              photo_url,
              caption,
              city,
              country_name,
              country_code,
              rating,
              review,
              location_name,
              created_at,
              is_public
            `)
            .eq('user_id', userId)
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .limit(24),
          getFollowCounts(userId),
        ]);

        if (!active) return;
        if (profileRes.error) throw profileRes.error;

        const publicPhotos = photosRes.data || [];
        const countResult = await getPhotoCommentCounts(publicPhotos.map((photo) => photo.id));
        if (!active) return;

        setCurrentUserId(myId);
        setProfile(profileRes.data);
        setVisitedCountries(countriesRes.data || []);
        setPhotos(publicPhotos.map((photo) => ({
          ...photo,
          profiles: profileRes.data,
          comment_count: countResult.data?.[photo.id] || 0,
        })));
        setFollowCounts(followCountsRes);

        if (myId && myId !== userId) {
          const followingRes = await getFollowing(myId);
          if (!active) return;
          setIsFollowing(
            followingRes.success &&
            Array.isArray(followingRes.data) &&
            followingRes.data.includes(userId)
          );
        }
      } catch {
        if (active) setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [userId]);

  const toggleFollow = async () => {
    if (!currentUserId) return;

    const result = isFollowing
      ? await unfollowUser(currentUserId, userId)
      : await followUser(currentUserId, userId);

    if (!result.success) {
      Alert.alert('Erro', result.error || 'Não foi possível atualizar este perfil.');
      return;
    }

    setIsFollowing((current) => !current);
    setFollowCounts((current) => ({
      ...current,
      followers: Math.max(0, current.followers + (isFollowing ? -1 : 1)),
    }));
  };

  const openPhoto = (photo) => {
    navigation.navigate('PhotoDetail', { photoId: photo.id, photo });
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
        <Text style={styles.notFound}>Perfil não encontrado</Text>
        <TouchableOpacity style={styles.menuButton} onPress={() => navigation.navigate('Main')}>
          <Ionicons name="home-outline" size={18} color="#fff" />
          <Text style={styles.menuButtonText}>Voltar ao menu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const level = getLevel(visitedCountries.length);
  const isOwnProfile = currentUserId === userId;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <TouchableOpacity accessibilityLabel="Voltar" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={23} color="#F7F7F2" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Perfil</Text>
        <TouchableOpacity
          accessibilityLabel="Voltar ao menu"
          style={styles.homeButton}
          onPress={() => navigation.navigate('Main')}
        >
          <Ionicons name="home-outline" size={20} color="#F7F7F2" />
          <Text style={styles.homeText}>Menu</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.avatarRing, isFollowing && styles.avatarRingActive]}>
            <Avatar profile={profile} size={84} />
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
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Connections', { userId, mode: 'followers' })}
            >
              <Text style={styles.statValue}>{followCounts.followers}</Text>
              <Text style={styles.statLabel}>Seguidores</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => navigation.navigate('Connections', { userId, mode: 'following' })}
            >
              <Text style={styles.statValue}>{followCounts.following}</Text>
              <Text style={styles.statLabel}>Seguindo</Text>
            </TouchableOpacity>
          </View>

          {!isOwnProfile ? (
            <TouchableOpacity
              onPress={toggleFollow}
              style={[styles.followButton, isFollowing && styles.followingButton]}
            >
              <Text style={[styles.followText, isFollowing && styles.followingText]}>
                {isFollowing ? 'Seguindo ✓' : 'Seguir'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.levelCard}>
            <Text style={styles.levelEmoji}>{level.emoji}</Text>
            <View style={styles.levelText}>
              <Text style={styles.levelName}>{level.name}</Text>
              <Text style={styles.levelSub}>
                {visitedCountries.length} países visitados
              </Text>
            </View>
          </View>
        </View>

        {visitedCountries.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PAÍSES VISITADOS</Text>
            <View style={styles.flagGrid}>
              {visitedCountries.map((country) => (
                <CountryFlag
                  key={country.country_code}
                  countryCode={country.country_code}
                  width={38}
                  height={25}
                  borderRadius={4}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PUBLICAÇÕES</Text>
          {photos.length === 0 ? (
            <Text style={styles.emptyPhotos}>Nenhuma foto pública ainda.</Text>
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.photoCard}
                  activeOpacity={0.86}
                  onPress={() => openPhoto(photo)}
                >
                  <Image source={{ uri: photo.photo_url }} style={styles.photoThumb} />
                  <View style={styles.photoInfo}>
                    <View style={styles.photoLocation}>
                      {photo.country_code ? (
                        <CountryFlag
                          countryCode={photo.country_code}
                          width={19}
                          height={13}
                          borderRadius={2}
                        />
                      ) : null}
                      <Text style={styles.photoLocationText} numberOfLines={1}>
                        {photo.location_name || photo.city || photo.country_name}
                      </Text>
                    </View>
                    {photo.rating > 0 ? (
                      <StarRating rating={photo.rating} size={11} />
                    ) : null}
                    {photo.caption ? (
                      <Text style={styles.photoCaption} numberOfLines={2}>
                        {photo.caption}
                      </Text>
                    ) : null}
                    {photo.review ? (
                      <Text style={styles.photoReview} numberOfLines={2}>
                        “{photo.review}”
                      </Text>
                    ) : null}
                    <View style={styles.commentCount}>
                      <Ionicons name="chatbubble-outline" size={13} color="#9aa0c6" />
                      <Text style={styles.commentCountText}>
                        {photo.comment_count} {photo.comment_count === 1 ? 'comentário' : 'comentários'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0D1326' },
  container: { flex: 1 },
  scrollContent: { alignItems: 'center' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1326',
    padding: 24,
  },
  topBar: {
    minHeight: 76,
    paddingTop: 28,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#202744',
  },
  topBarTitle: { color: '#F7F7F2', fontSize: 17, fontWeight: '700' },
  homeButton: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  homeText: { color: '#F7F7F2', fontSize: 12, fontWeight: '600' },
  notFound: { color: '#9aa0c6', marginBottom: 16 },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#6C2BD9',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  menuButtonText: { color: '#fff', fontWeight: '700' },
  header: {
    width: '100%',
    maxWidth: 1000,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
  },
  avatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#2a2f50',
    padding: 0,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRingActive: { borderColor: '#6C2BD9' },
  displayName: { fontSize: 20, fontWeight: '700', color: '#F7F7F2', marginBottom: 4 },
  username: { fontSize: 13, color: '#9aa0c6', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 19, fontWeight: '700', color: '#FF9A00' },
  statLabel: { fontSize: 10, color: '#9aa0c6', marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: '#2a2f50' },
  followButton: {
    paddingVertical: 10,
    paddingHorizontal: 44,
    borderRadius: 24,
    backgroundColor: '#6C2BD9',
  },
  followingButton: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#6C2BD9' },
  followText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  followingText: { color: '#9b65ef' },
  section: { width: '100%', maxWidth: 1000, paddingHorizontal: 18, marginBottom: 24 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9aa0c6',
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1b1f3a',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  levelEmoji: { fontSize: 28 },
  levelText: { flex: 1 },
  levelName: { fontSize: 15, fontWeight: '700', color: '#F7F7F2' },
  levelSub: { fontSize: 11, color: '#9aa0c6', marginTop: 2 },
  flagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 12,
  },
  photoCard: {
    width: '48%',
    minWidth: 156,
    flexGrow: 1,
    backgroundColor: '#1b1f3a',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#262d4d',
  },
  photoThumb: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#202744' },
  photoInfo: { padding: 11, gap: 6 },
  photoLocation: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoLocationText: { flex: 1, color: '#aeb3c9', fontSize: 11 },
  photoCaption: { color: '#F7F7F2', fontSize: 12, lineHeight: 17 },
  photoReview: { color: '#c4c7d7', fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  commentCount: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  commentCountText: { color: '#9aa0c6', fontSize: 10 },
  emptyPhotos: { color: '#7f86a5', fontSize: 13 },
  bottomSpace: { height: 70 },
});
