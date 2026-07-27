import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../utils/constants';
import { getCountryPhotos, deletePhoto, setCoverPhoto, removeCoverPhoto, getFavoritePhotos, addFavorite, removeFavorite, updatePhotoPrivacy } from '../services/photoService';
import { confirm, notify } from '../utils/dialogs';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLUMN_GAP = 12;
const NUM_COLUMNS = 2;
const PHOTO_SIZE = (SCREEN_WIDTH - SIZES.padding * 2 - COLUMN_GAP) / NUM_COLUMNS;

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PhotoGallery({ countryCode, countryName, userId, coverPhotoId: initialCoverPhotoId, onCoverPhotoSet, scrollToCity, onScrollToCityDone, onStatsUpdate }) {
  const [photos, setPhotos] = useState([]);
  const [photosByCity, setPhotosByCity] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coverPhotoId, setCoverPhotoId] = useState(initialCoverPhotoId);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [privacyToast, setPrivacyToast] = useState(null);

  const loadPhotos = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const [result, favResult] = await Promise.all([
      getCountryPhotos(userId, countryCode),
      getFavoritePhotos(userId),
    ]);

    const favIds = favResult.success ? new Set(favResult.data.map(f => f.id)) : new Set();
    if (favResult.success) {
      setFavoriteIds(favIds);
    }

    if (result.success) {
      setPhotos(result.data);

      const grouped = {};
      result.data.forEach(photo => {
        const key = photo.city || 'Sem cidade';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(photo);
      });
      setPhotosByCity(grouped);

      if (onStatsUpdate) {
        onStatsUpdate({
          photoCount: result.data.length,
          cityCount: Object.keys(grouped).length,
          favoriteCount: result.data.filter(p => favIds.has(p.id)).length,
        });
      }
    } else {
      Alert.alert('Erro', 'Não foi possível carregar as fotos.');
    }

    setLoading(false);
    setRefreshing(false);
  }, [userId, countryCode]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  useEffect(() => {
    if (!scrollToCity || Platform.OS !== 'web') return;

    setTimeout(() => {
      const elementId = `city-section-${scrollToCity.replace(/\s/g, '-')}`;
      const element = document.getElementById(elementId);

      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (onScrollToCityDone) onScrollToCityDone();
      }
    }, 800);
  }, [scrollToCity]);

  const handleDelete = async (photoId, photoPath) => {
    const confirmacao = await confirm('Excluir foto', 'Tem certeza que deseja deletar esta foto?');
    if (!confirmacao) return;

    const result = await deletePhoto(photoId, photoPath);
    if (result.success) {
      notify('Foto excluída', 'Foto deletada com sucesso!');
      loadPhotos();
    } else {
      notify('Erro ao excluir', result.error || 'Não foi possível deletar a foto.');
    }
  };

  const handleSetCover = async (photoId, photoUrl) => {
    if (photoId === coverPhotoId) {
      const confirmacao = await confirm('Remover capa', 'Remover esta foto como capa do país?');
      if (!confirmacao) return;

      const result = await removeCoverPhoto(userId, countryCode);
      if (result.success) {
        notify('Capa removida', 'Foto removida como capa!');
        setCoverPhotoId(null);
        if (onCoverPhotoSet) onCoverPhotoSet(null, null);
        loadPhotos();
      } else {
        Alert.alert('Erro', 'Não foi possível remover a foto de capa.');
      }
      return;
    }

    const confirmacao = await confirm('Definir capa', 'Definir esta foto como capa do país no mapa?');
    if (!confirmacao) return;

    if (coverPhotoId && coverPhotoId !== photoId) {
      const substituir = await confirm('Substituir capa', 'Já existe uma foto de capa. Deseja substituir pela nova?');
      if (!substituir) return;
    }

    const result = await setCoverPhoto(userId, countryCode, photoId, photoUrl);

    if (result.success) {
      setCoverPhotoId(photoId);
      if (onCoverPhotoSet) onCoverPhotoSet(photoId, photoUrl);
      loadPhotos();
      notify('Capa definida', 'Foto definida como capa! ⭐');
    } else {
      Alert.alert('Erro', 'Não foi possível definir a foto de capa.');
    }
  };

  const handleToggleFavorite = async (photoId) => {
    const isFav = favoriteIds.has(photoId);
    if (isFav) {
      const result = await removeFavorite(userId, photoId);
      if (result.success) {
        setFavoriteIds(prev => {
          const next = new Set(prev);
          next.delete(photoId);
          return next;
        });
      }
    } else {
      const result = await addFavorite(userId, photoId);
      if (result.success) {
        setFavoriteIds(prev => new Set([...prev, photoId]));
      }
    }
  };

  const handleTogglePrivacy = async (photo) => {
    const newValue = !photo.is_public;
    const result = await updatePhotoPrivacy(photo.id, newValue);
    if (result.success) {
      setPhotos(prev => prev.map(p =>
        p.id === photo.id ? { ...p, is_public: newValue } : p
      ));
      setPhotosByCity(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(city => {
          updated[city] = updated[city].map(p =>
            p.id === photo.id ? { ...p, is_public: newValue } : p
          );
        });
        return updated;
      });
      setPrivacyToast(newValue ? 'Foto pública' : 'Foto privada');
      setTimeout(() => setPrivacyToast(null), 2000);
    }
  };

  const renderPhotoCard = (item) => (
    <View key={item.id} style={styles.photoCardWrapper}>
      <View style={styles.photoCard}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            const index = photos.findIndex(p => p.id === item.id);
            setFullscreenIndex(index >= 0 ? index : 0);
            setFullscreenPhoto(item);
          }}
        >
          <Image
            source={{ uri: item.photo_url }}
            style={styles.photoImage}
            resizeMode="cover"
          />
        </TouchableOpacity>

        <View style={styles.photoInfo}>
          {!!item.caption && (
            <Text style={styles.photoCaption} numberOfLines={2}>{item.caption}</Text>
          )}
        </View>

        {(item.rating > 0 || item.location_name) && (
          <View style={styles.photoMeta}>
            {item.location_name && (
              <View style={styles.photoLocationRow}>
                <Ionicons name="location" size={11} color="#6C2BD9" />
                <Text style={styles.photoLocationText} numberOfLines={1}>
                  {item.location_name}
                </Text>
              </View>
            )}
            {item.rating > 0 && (
              <View style={styles.photoStarsRow}>
                {[1,2,3,4,5].map(s => (
                  <Text key={s} style={{ color: s <= item.rating ? '#6C2BD9' : '#e0e0e0', fontSize: 11 }}>★</Text>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.photoFooter}>
          <Text style={styles.photoDate}>{formatDate(item.created_at)}</Text>
          <TouchableOpacity
            style={[
              styles.privacyBtn,
              { backgroundColor: item.is_public ? '#6C2BD9' : '#999' },
            ]}
            onPress={() => handleTogglePrivacy(item)}
          >
            <Ionicons
              name={item.is_public ? 'earth' : 'lock-closed'}
              size={10}
              color="white"
            />
            <Text style={styles.privacyBtnText}>
              {item.is_public ? 'Público' : 'Privado'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.coverButton}
          onPress={() => handleToggleFavorite(item.id)}
          activeOpacity={0.7}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Ionicons
            name={favoriteIds.has(item.id) ? 'star' : 'star-outline'}
            size={14}
            color={favoriteIds.has(item.id) ? '#FFD700' : '#FFFFFF'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item.id, item.photo_path)}
          activeOpacity={0.7}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Ionicons name="trash" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPhotoRow = (rowPhotos) => (
    <View style={styles.row}>
      {rowPhotos.map(photo => renderPhotoCard(photo))}
      {rowPhotos.length === 1 && <View style={styles.photoCardWrapper} />}
    </View>
  );

  const chunkArray = (arr, size) => {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Carregando fotos...</Text>
      </View>
    );
  }

  return (
    <>
      {privacyToast && (
        <View style={styles.toast}>
          <Ionicons
            name={privacyToast === 'Foto pública' ? 'earth-outline' : 'lock-closed-outline'}
            size={14}
            color="white"
          />
          <Text style={styles.toastText}>{privacyToast}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.listContent,
          photos.length === 0 && styles.listContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadPhotos(true)}
          />
        )}
      >
        {photos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={52} color={COLORS.lightGray} />
            <Text style={styles.emptyTitle}>Sem fotos ainda</Text>
            <Text style={styles.emptySubtitle}>Adicione fotos da sua visita a {countryName}!</Text>
          </View>
        ) : (
          <>
          {(() => {
            const favoritesInCountry = photos.filter(p => favoriteIds.has(p.id));
            return favoritesInCountry.length > 0 ? (
              <View style={styles.citySection}>
                <View style={styles.citySectionHeader}>
                  <Ionicons name="heart" size={14} color="#FF3366" />
                  <Text style={styles.citySectionTitle}>Favoritos</Text>
                  <Text style={styles.citySectionCount}>
                    {favoritesInCountry.length} foto{favoritesInCountry.length > 1 ? 's' : ''}
                  </Text>
                </View>
                {chunkArray(favoritesInCountry, NUM_COLUMNS).map((row, i) => (
                  <View key={i}>{renderPhotoRow(row)}</View>
                ))}
              </View>
            ) : null;
          })()}
          {Object.entries(photosByCity).map(([city, cityPhotos]) => (
            <View
              key={city}
              nativeID={`city-section-${city.replace(/\s/g, '-')}`}
              style={styles.citySection}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location-outline" size={14} color="#6C2BD9" />
                  <Text style={styles.cityTitle}>{city}</Text>
                </View>
                <Text style={styles.cityPhotoCount}>
                  {cityPhotos.length} {cityPhotos.length === 1 ? 'foto' : 'fotos'}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 16 }}
              >
                {cityPhotos.map((photo, photoIndex) => (
                  <TouchableOpacity
                    key={photoIndex}
                    style={styles.carouselCard}
                    onPress={() => {
                      const index = photos.findIndex(p => p.id === photo.id);
                      setFullscreenIndex(index >= 0 ? index : 0);
                      setFullscreenPhoto(photo);
                    }}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={{ uri: photo.photo_url }}
                      style={styles.carouselImage}
                      resizeMode="cover"
                    />
                    {(photo.rating > 0 || photo.location_name) && (
                      <View style={styles.carouselMeta}>
                        {photo.location_name && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Ionicons name="location" size={10} color="#6C2BD9" />
                            <Text style={styles.carouselLocation} numberOfLines={1}>
                              {photo.location_name}
                            </Text>
                          </View>
                        )}
                        {photo.rating > 0 && (
                          <View style={{ flexDirection: 'row', gap: 1, marginTop: 2 }}>
                            {[1,2,3,4,5].map(s => (
                              <Text key={s} style={{ color: s <= photo.rating ? '#6C2BD9' : '#e0e0e0', fontSize: 10 }}>★</Text>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.privacyBadgeCarousel,
                        { backgroundColor: photo.is_public ? 'rgba(255,107,53,0.85)' : 'rgba(0,0,0,0.55)' }
                      ]}
                      onPress={() => handleTogglePrivacy(photo)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={photo.is_public ? 'earth' : 'lock-closed'} size={9} color="white" />
                      <Text style={{ color: 'white', fontSize: 8, fontWeight: '600' }}>
                        {photo.is_public ? 'Público' : 'Privado'}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ))}
          </>
        )}
      </ScrollView>

      {/* Modal fullscreen */}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <View style={styles.fullscreenContainer}>
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullscreenPhoto(null)}
          >
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>

          <Text style={styles.fullscreenCounter}>
            {fullscreenIndex + 1} / {photos.length}
          </Text>

          <Image
            source={{ uri: fullscreenPhoto?.photo_url }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />

          {fullscreenPhoto?.city && (
            <View style={styles.fullscreenInfo}>
              <Ionicons name="location" size={14} color="#6C2BD9" />
              <Text style={styles.fullscreenCity}>{fullscreenPhoto.city}</Text>
            </View>
          )}

          {fullscreenIndex > 0 && (
            <TouchableOpacity
              style={[styles.fullscreenNav, styles.fullscreenNavLeft]}
              onPress={() => {
                const prev = fullscreenIndex - 1;
                setFullscreenIndex(prev);
                setFullscreenPhoto(photos[prev]);
              }}
            >
              <Ionicons name="chevron-back" size={28} color="white" />
            </TouchableOpacity>
          )}

          {fullscreenIndex < photos.length - 1 && (
            <TouchableOpacity
              style={[styles.fullscreenNav, styles.fullscreenNavRight]}
              onPress={() => {
                const next = fullscreenIndex + 1;
                setFullscreenIndex(next);
                setFullscreenPhoto(photos[next]);
              }}
            >
              <Ionicons name="chevron-forward" size={28} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  listContent: {
    padding: SIZES.padding,
    paddingTop: 8,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: COLUMN_GAP,
  },
  citySection: {
    marginBottom: 20,
  },
  citySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  citySectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  citySectionCount: {
    fontSize: 12,
    color: COLORS.gray,
  },
  photoCard: {
    width: '100%',
    borderRadius: SIZES.radius,
    overflow: 'hidden',
    backgroundColor: 'white',
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#f0f0f0',
  },
  photoImage: {
    width: '100%',
    aspectRatio: 4/3,
  },
  photoCardWrapper: {
    width: PHOTO_SIZE,
    position: 'relative',
  },
  photoMeta: { paddingHorizontal: 8, paddingBottom: 8, gap: 3 },
  photoLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  photoLocationText: { fontSize: 11, color: '#6C2BD9', fontWeight: '600', flex: 1 },
  photoStarsRow: { flexDirection: 'row', gap: 1 },
  photoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  privacyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  privacyBtnText: { color: 'white', fontSize: 9, fontWeight: '600' },
  coverButton: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1000,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoInfo: {
    padding: 8,
    gap: 2,
  },
  photoCaption: {
    fontSize: SIZES.small,
    color: COLORS.text,
    fontWeight: '500',
    lineHeight: 16,
  },
  photoDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontSize: SIZES.h4,
    fontWeight: '600',
    color: COLORS.gray,
  },
  emptySubtitle: {
    fontSize: SIZES.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: SIZES.body,
    color: COLORS.gray,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenCounter: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  fullscreenImage: {
    width: '100%',
    height: '80%',
  },
  fullscreenInfo: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  fullscreenCity: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
  },
  fullscreenNav: {
    position: 'absolute',
    top: '50%',
    width: 44,
    height: 44,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenNavLeft: { left: 16 },
  fullscreenNavRight: { right: 16 },
  toast: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 100,
  },
  toastText: { color: 'white', fontSize: 12, fontWeight: '500' },
  cityTitle: { fontSize: 15, fontWeight: '600', color: '#0D1326' },
  cityPhotoCount: { fontSize: 11, color: '#aaa' },
  carouselCard: { width: 160, borderRadius: 10, overflow: 'hidden', backgroundColor: '#ddd', flexShrink: 0 },
  carouselImage: { width: 160, height: 120 },
  carouselMeta: { padding: 7, backgroundColor: 'white' },
  carouselLocation: { fontSize: 11, color: '#6C2BD9', fontWeight: '600', flex: 1 },
  privacyBadgeCarousel: { position: 'absolute', top: 7, right: 7, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', gap: 2 },
});
