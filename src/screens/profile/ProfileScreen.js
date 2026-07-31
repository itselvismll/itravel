import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { captureRef } from 'react-native-view-shot';
import { toPng } from 'html-to-image';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import ShareCard from '../../components/ShareCard';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser, signOut, getVisitedCountries, supabase } from '../../services/supabase';
import { getWishlist } from '../../services/socialService';
import { getProfile } from '../../services/profileService';
import { getFavoritePhotos, getAllUserPhotos } from '../../services/photoService';
import {
  getAlpha2,
  getStampRotation,
  getCountryNamePtByCode,
} from '../../utils/countryUtils';
import StarRating from '../../components/StarRating';
import CountryFlag from '../../components/CountryFlag';
import { useUpload } from '../../context/UploadContext';
import { getLevelInfo } from '../../utils/travelerLevels';
import { confirm, notify } from '../../utils/dialogs';

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [visitedCountries, setVisitedCountries] = useState([]);
  const [favoritePhotos, setFavoritePhotos] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const { refreshTrigger } = useUpload();
  const shareCardRef = useRef(null);

  useEffect(() => {
    if (refreshTrigger > 0) loadProfile();
  }, [refreshTrigger]);

  const loadProfile = async () => {
    try {
      const user = await getCurrentUser();
      if (!user) return;

      const { data: { user: authUser } } = await supabase.auth.getUser();
      setAvatarUrl(authUser?.user_metadata?.avatar_url || null);

      const profileResult = await getProfile(user.id);

      if (profileResult.success && profileResult.data) {
        setProfile(profileResult.data);
      }

      const [countriesResult, favResult, photosResult, wishlistResult] = await Promise.all([
        getVisitedCountries(user.id),
        getFavoritePhotos(user.id),
        getAllUserPhotos(user.id),
        getWishlist(user.id),
      ]);

      if (countriesResult.success) setVisitedCountries(countriesResult.data);
      if (favResult.success) setFavoritePhotos(favResult.data);
      if (photosResult.success) setPhotos(photosResult.data);
      if (wishlistResult.success) setWishlist(wishlistResult.data);

      const { count: followers } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);

      const { count: following } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id);

      setFollowersCount(followers || 0);
      setFollowingCount(following || 0);

      const { data: notifs } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('read', false);
      setUnreadCount((notifs || []).length);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  const handleLogout = async () => {
    const confirmacao = await confirm('Sair da conta', 'Tem certeza que deseja sair da sua conta?');
    if (!confirmacao) return;

    try {
      const result = await signOut();
      if (result.success) {
        // AppNavigator reage à mudança de sessão e mostra a tela de login.
      } else {
        notify('Erro ao sair', result.error || 'Não foi possível sair da conta.');
      }
    } catch (error) {
      notify('Erro ao sair', error.message || 'Não foi possível sair da conta.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C2BD9" />
      </View>
    );
  }

  const displayName = profile?.display_name || profile?.username || '?';
  const initials = profile?.display_name?.[0]?.toUpperCase() || '?';
  const levelInfo = getLevelInfo(visitedCountries.length);
  const countriesToNext = levelInfo.next ? levelInfo.next.minCountries - visitedCountries.length : 0;
  const visitedCountryCodes = visitedCountries.map(c => c.country_code);
  const totalPhotosCount = photos.length;
  const totalCities = new Set(photos.filter(p => p.city).map(p => p.city)).size;

  const handleShare = async () => {
    try {
      if (Platform.OS === 'web') {
        const dataUrl = await toPng(shareCardRef.current, {
          pixelRatio: 2,
          backgroundColor: '#0D1326',
          skipFonts: true,
          fontEmbedCSS: '',
          cacheBust: true,
          width: 360,
          height: 640,
        });
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'meu-passaporte-journi.png';
        link.click();
      } else {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
        await Sharing.shareAsync(uri);
      }
    } catch {
      notify('Erro ao compartilhar', 'Não foi possível gerar seu passaporte agora.');
    }
  };


  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* Header escuro */}
      <View style={styles.header}>
        <Image
          source={require('../../../assets/journi_simbolo.png')}
          style={{ width: 28, height: 28, position: 'absolute', top: 16, left: 16 }}
          resizeMode="contain"
        />
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => navigation.navigate('EditProfile', { profile })}
        >
          <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Notificações')}
          style={{ position: 'absolute', top: 16, right: 56 }}
        >
          <Ionicons name="notifications-outline" size={24} color="#F7F7F2" />
          {unreadCount > 0 && (
            <View style={{
              position: 'absolute', top: -4, right: -4,
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: '#FF4D6D',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.avatar}>
          {(profile?.avatar_url || avatarUrl) ? (
            <Image source={{ uri: profile?.avatar_url || avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 36 }} />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </View>
        <Text style={styles.displayName}>{displayName}</Text>
        {profile?.username && (
          <Text style={styles.username}>@{profile.username}</Text>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{visitedCountries.length}</Text>
            <Text style={styles.statLbl}>Países</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => navigation.navigate('Connections', {
              userId: profile?.id,
              mode: 'followers',
            })}
          >
            <Text style={styles.statVal}>{followersCount}</Text>
            <Text style={styles.statLbl}>Seguidores</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.statItem}
            onPress={() => navigation.navigate('Connections', {
              userId: profile?.id,
              mode: 'following',
            })}
          >
            <Text style={styles.statVal}>{followingCount}</Text>
            <Text style={styles.statLbl}>Seguindo</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Card de nível */}
      <View style={styles.card}>
        <View style={styles.levelRow}>
          <Text style={styles.levelIcon}>{levelInfo.current.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.levelName}>{levelInfo.current.name}</Text>
            <Text style={styles.levelCountText}>
              {visitedCountries.length} {visitedCountries.length === 1 ? 'país visitado' : 'países visitados'}
            </Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(levelInfo.progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressLabel}>
          {levelInfo.next
            ? `Faltam ${countriesToNext} ${countriesToNext === 1 ? 'país' : 'países'} para ${levelInfo.next.icon} ${levelInfo.next.name}`
            : 'Nível máximo atingido! 👑'}
        </Text>
      </View>

      {/* Passaporte */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="book-outline" size={14} color="#999" />
          <Text style={styles.cardTitle}>PASSAPORTE</Text>
        </View>
        {visitedCountries.length === 0 ? (
          <View style={styles.emptyPassport}>
            <Text style={{ fontSize: 32 }}>🧳</Text>
            <Text style={styles.emptyPassportText}>
              Seus carimbos aparecem aqui conforme você visita novos países
            </Text>
          </View>
        ) : (
          <View style={styles.stampsGrid}>
            {visitedCountries.map((country, index) => {
              const rotations = [-4, 3, -3, 4];
              const rotation = rotations[index % 4];
              return (
                <View
                  key={country.country_code}
                  style={[styles.travelTag, { transform: [{ rotate: `${rotation}deg` }] }]}
                >
                  <View style={styles.tagHole} />
                  <View style={styles.tagCountryMark}>
                    <CountryFlag
                      countryCode={country.country_code}
                      width={24}
                      height={16}
                      borderRadius={2}
                    />
                    <Text style={styles.tagCountryCode}>
                      {getAlpha2(country.country_code).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.tagDivider} />
                  <View style={styles.tagFooter}>
                    <Text style={styles.tagName} numberOfLines={1}>
                      {getCountryNamePtByCode(
                        country.country_code,
                        country.country_name
                      ).toUpperCase()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Wishlist */}
      {wishlist.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="heart-outline" size={14} color="#00D1C1" />
            <Text style={[styles.cardTitle, { color: '#00D1C1' }]}>QUERO VISITAR</Text>
          </View>
          <View style={styles.stampsGrid}>
            {wishlist.map((item, index) => {
              const rotations = [-4, 3, -3, 4];
              const rotation = rotations[index % 4];
              return (
                <View
                  key={item.id}
                  style={[styles.travelTag, { transform: [{ rotate: `${rotation}deg` }] }]}
                >
                  <View style={[styles.tagHole, { backgroundColor: '#00D1C1', borderColor: '#00A89C' }]} />
                  <View style={styles.tagCountryMark}>
                    <CountryFlag
                      countryCode={item.country_code}
                      width={24}
                      height={16}
                      borderRadius={2}
                    />
                    <Text style={[styles.tagCountryCode, { color: '#00A89C' }]}>
                      {getAlpha2(item.country_code).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.tagDivider} />
                  <View style={styles.tagFooter}>
                    <Text style={styles.tagName} numberOfLines={1}>
                      {getCountryNamePtByCode(
                        item.country_code,
                        item.country_name
                      ).toUpperCase()}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Botão compartilhar passaporte */}
      <TouchableOpacity
        style={styles.tripPlansBtn}
        onPress={() => navigation.navigate('SavedTrips')}
      >
        <View style={styles.tripPlansIcon}>
          <Ionicons name="map-outline" size={20} color="#C4B5FD" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripPlansTitle}>Minhas viagens planejadas</Text>
          <Text style={styles.tripPlansSubtitle}>Acesse roteiros, orçamento e checklist</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#8D95B4" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Ionicons name="share-social-outline" size={18} color="white" />
        <Text style={styles.shareBtnText}>Compartilhar meu passaporte</Text>
      </TouchableOpacity>

      {/* Fotos favoritas */}
      {favoritePhotos.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="star-outline" size={14} color="#999" />
            <Text style={styles.cardTitle}>FOTOS FAVORITAS</Text>
          </View>
          <View style={styles.favGrid}>
            {favoritePhotos.slice(0, 6).map((photo, i) => (
              <TouchableOpacity
                key={i}
                style={styles.favPhoto}
                onPress={() => setFullscreenPhoto(photo)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: photo.photo_url }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
                {photo.city && (
                  <View style={styles.favOverlay}>
                    <Text style={styles.favCity}>{photo.city}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Fotos recentes */}
      <View style={styles.card}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="images-outline" size={14} color="#999" />
          <Text style={styles.cardTitle}>FOTOS RECENTES</Text>
        </View>
        {photos.length === 0 ? (
          <View style={styles.emptyFav}>
            <Ionicons name="images-outline" size={28} color="#ddd" />
            <Text style={styles.emptyFavText}>Nenhuma foto ainda</Text>
          </View>
        ) : (
          <View style={styles.favGrid}>
            {photos.slice(0, 9).map((photo, i) => (
              <TouchableOpacity
                key={i}
                style={styles.favPhoto}
                onPress={() => setFullscreenPhoto(photo)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: photo.photo_url }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
                {photo.location_name && (
                  <View style={styles.photoOverlay}>
                    <Text style={styles.photoOverlayText} numberOfLines={1}>
                      {photo.location_name}
                    </Text>
                  </View>
                )}
                {photo.rating > 0 && (
                  <View style={styles.ratingBadge}>
                    <Text style={styles.ratingBadgeText}>★ {photo.rating}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Países visitados */}
      {visitedCountries.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="earth-outline" size={14} color="#999" />
            <Text style={styles.cardTitle}>PAÍSES VISITADOS</Text>
          </View>
          {visitedCountries.map((country, i) => (
            <View key={i} style={styles.countryRow}>
              <CountryFlag
                countryCode={country.country_code}
                width={30}
                height={20}
                borderRadius={3}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.countryName}>
                  {getCountryNamePtByCode(country.country_code, country.country_name)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {visitedCountries.length === 0 && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="earth-outline" size={14} color="#999" />
            <Text style={styles.cardTitle}>PAÍSES VISITADOS</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', paddingVertical: 16 }}>
            Nenhum país visitado ainda. Explore o mapa!
          </Text>
        </View>
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sair da conta</Text>
      </TouchableOpacity>

    </ScrollView>

    {/* Card oculto para captura — fixed no viewport mas atrás de tudo (zIndex -1) */}
    <View
      ref={shareCardRef}
      style={{ position: 'absolute', top: 0, left: 0, zIndex: -1, pointerEvents: 'none' }}
      collapsable={false}
    >
      <ShareCard
        profile={profile}
        visitedCountryCodes={visitedCountryCodes}
        wishlistCodes={wishlist.map(w => w.country_code)}
        totalPhotos={totalPhotosCount}
        totalCities={totalCities}
      />
    </View>

    <Modal
      visible={fullscreenPhoto !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setFullscreenPhoto(null)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity
          style={{ position: 'absolute', top: 48, right: 20, zIndex: 10 }}
          onPress={() => setFullscreenPhoto(null)}
        >
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>
        {fullscreenPhoto && (
          <>
            <Image
              source={{ uri: fullscreenPhoto.photo_url }}
              style={{ width: '100%', height: '60%' }}
              resizeMode="contain"
            />
            <View style={{ alignItems: 'center', paddingHorizontal: 24, marginTop: 16, gap: 8 }}>
              {fullscreenPhoto.location_name && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location" size={14} color="#6C2BD9" />
                  <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>
                    {fullscreenPhoto.location_name}
                  </Text>
                </View>
              )}
              {fullscreenPhoto.rating > 0 && (
                <StarRating rating={fullscreenPhoto.rating} size={20} inactiveColor="rgba(255,255,255,0.2)" />
              )}
              {fullscreenPhoto.review && (
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', lineHeight: 20 }}>
                  "{fullscreenPhoto.review}"
                </Text>
              )}
              {fullscreenPhoto.city && (
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  {fullscreenPhoto.city}
                </Text>
              )}
              {fullscreenPhoto.created_at && (
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                  {new Date(fullscreenPhoto.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </Text>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  header: {
    backgroundColor: '#0D1326',
    padding: 24,
    alignItems: 'center',
  },
  editBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6C2BD9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700', fontFamily: 'Poppins_700Bold',
    color: 'white',
    letterSpacing: -0.5,
  },
  username: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  statItem: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 4 },
  statVal: { fontSize: 20, fontWeight: '700', color: '#6C2BD9' },
  statLbl: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  statDivider: { width: 0.5, height: 28, backgroundColor: 'rgba(255,255,255,0.15)' },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    margin: 12,
    marginBottom: 0,
  },
  tripPlansBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#171D36',
    borderRadius: 14,
    padding: 14,
    margin: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(108,43,217,0.3)',
  },
  tripPlansIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(108,43,217,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripPlansTitle: { color: '#F7F7F2', fontSize: 13, fontWeight: '800' },
  tripPlansSubtitle: { color: '#8D95B4', fontSize: 10, marginTop: 3 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyFav: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyFavText: { fontSize: 13, color: '#bbb' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  levelIcon: { fontSize: 32 },
  levelName: { fontSize: 18, fontWeight: '700', color: '#0D1326' },
  levelCountText: { fontSize: 12, color: '#999', marginTop: 2 },
  progressBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6C2BD9',
    borderRadius: 3,
  },
  progressLabel: { fontSize: 11, color: '#aaa' },
  stampsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 8, justifyContent: 'flex-start' },
  travelTag: {
    width: 104,
    height: 58,
    backgroundColor: '#F3ECDC',
    borderRadius: 10,
    ...Platform.select({
      web: { boxShadow: '2px 3px 4px rgba(0,0,0,0.25)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
      },
    }),
    overflow: 'hidden',
  },
  tagHole: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0D1326',
    borderWidth: 1,
    borderColor: '#A0906C',
    zIndex: 2,
  },
  tagCountryMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tagCountryCode: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tagDivider: {
    position: 'absolute',
    bottom: 18,
    left: 8,
    right: 8,
    borderBottomWidth: 1,
    borderColor: '#C8BFA5',
    borderStyle: 'dashed',
  },
  tagFooter: {
    position: 'absolute',
    bottom: 5,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagName: {
    fontWeight: '700',
    fontSize: 9,
    color: '#46371E',
    flex: 1,
  },
  emptyPassport: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  emptyPassportText: { fontSize: 12, color: '#bbb', textAlign: 'center', lineHeight: 18 },
  photoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', padding: 3 },
  photoOverlayText: { color: 'white', fontSize: 8 },
  ratingBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,107,53,0.9)', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  ratingBadgeText: { color: 'white', fontSize: 8, fontWeight: '600' },
  favGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  favPhoto: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ddd',
  },
  favOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 4,
  },
  favCity: {
    color: 'white',
    fontSize: 8,
    fontWeight: '500',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  countryName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0D1326',
    letterSpacing: -0.2,
  },
  countryMeta: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 1,
    fontWeight: '400',
  },
  countryPhotos: {
    fontSize: 12,
    color: '#6C2BD9',
    fontWeight: '600',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6C2BD9',
    borderRadius: 10,
    padding: 12,
    margin: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  shareBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  logoutBtn: {
    margin: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 32,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
});
