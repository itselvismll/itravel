import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, TextInput,
  StyleSheet, ActivityIndicator, Modal, FlatList, Alert, Platform
} from 'react-native';
import { Image as CachedImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { getCurrentUser } from '../../services/supabase';
import {
  ALPHA3_TO_ALPHA2,
  getAlpha3,
  getCountryNamePtByCode,
} from '../../utils/countryUtils';
import {
  searchCountries,
  COUNTRY_SEARCH_DEBOUNCE_MS,
} from '../../utils/geoSearch';
import { followUser, unfollowUser, getFollowing, getUsersToDiscover } from '../../services/followService';
import useTabBarContentPadding from '../../hooks/useTabBarContentPadding';
import { searchTravelers, getSuggestedTravelers, addToWishlist, removeFromWishlist, isInWishlist } from '../../services/socialService';
import { deletePhoto } from '../../services/photoService';
import StarRating from '../../components/StarRating';
import Avatar from '../../components/Avatar';
import CountryFlag from '../../components/CountryFlag';
import { useUpload } from '../../context/UploadContext';
import { COUNTRIES_STATIC } from '../../data/countriesStaticData';
import { confirm, notify } from '../../utils/dialogs';
import { getTourismImage } from '../../services/tourismImageService';

const MOCK_USERS = [
  { id: '1', username: 'maria_viaja', display_name: 'Maria', avatar_url: null, countries: 12 },
  { id: '2', username: 'joao_mundo', display_name: 'João', avatar_url: null, countries: 8 },
  { id: '3', username: 'ana_travel', display_name: 'Ana', avatar_url: null, countries: 5 },
  { id: '4', username: 'pedro_explora', display_name: 'Pedro', avatar_url: null, countries: 15 },
  { id: '5', username: 'carla_aventura', display_name: 'Carla', avatar_url: null, countries: 3 },
];

// Tendência sazonal combinada com sinais reais do app (buscas, fotos, wishlist e
// pessoas seguidas). Assim a lista muda ao longo do ano sem fingir números externos.
const SEASONAL_COUNTRIES_BY_MONTH = {
  0: ['ARG', 'CHL', 'URY', 'AUS', 'NZL'],
  1: ['BRA', 'ARG', 'CHL', 'THA', 'IDN'],
  2: ['JPN', 'NLD', 'PRT', 'MAR', 'EGY'],
  3: ['JPN', 'NLD', 'FRA', 'ITA', 'ESP'],
  4: ['ITA', 'PRT', 'GRC', 'TUR', 'FRA'],
  5: ['ITA', 'GRC', 'HRV', 'ESP', 'PRT'],
  6: ['FRA', 'ITA', 'GRC', 'HRV', 'GBR'],
  7: ['PRT', 'ESP', 'FRA', 'ITA', 'GBR'],
  8: ['ITA', 'GRC', 'TUR', 'PRT', 'ZAF'],
  9: ['USA', 'CAN', 'DEU', 'CZE', 'JPN'],
  10: ['USA', 'MEX', 'ARG', 'CHL', 'EGY'],
  11: ['BRA', 'ARG', 'CHL', 'AUT', 'CHE'],
};

const getSeasonalBoost = countryCode => {
  const seasonal = SEASONAL_COUNTRIES_BY_MONTH[new Date().getMonth()] || [];
  const position = seasonal.indexOf(countryCode);
  return position < 0 ? 0 : (seasonal.length - position) * 3;
};

export default function ExploreScreen({ navigation }) {
  // A tab bar flutua SOBRE a lista e não reserva espaço no layout: sem esta
  // folga o botão "Seguir" dos últimos usuários nasce atrás dela, invisível e
  // sem receber toque.
  const tabBarPadding = useTabBarContentPadding();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [allCountries, setAllCountries] = useState([]);
  const [popularCountries, setPopularCountries] = useState([]);
  const [following, setFollowing] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [countryPhotos, setCountryPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  const [recentPhotos, setRecentPhotos] = useState([]);
  const [discoverUsers, setDiscoverUsers] = useState([]);
  const [suggestedTravelers, setSuggestedTravelers] = useState([]);
  const [travelerSearchResults, setTravelerSearchResults] = useState([]);
  const [countryWishlisted, setCountryWishlisted] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);

  const { refreshTrigger } = useUpload();

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (refreshTrigger > 0) loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    setCurrentUser(user);

    const parallelTasks = [loadPersonalizedExplore(user), loadAllCountries()];
    if (user) {
      parallelTasks.push(
        getFollowing(user.id).then(r => { if (r.success) setFollowing(r.data); }),
        getUsersToDiscover(user.id).then(r => { if (r.success) setDiscoverUsers(r.data); }),
        getSuggestedTravelers(user.id).then(r => { if (r.success) setSuggestedTravelers(r.data); }),
      );
    }
    await Promise.all(parallelTasks);
    setLoading(false);
  };

  const buildFallbackCountries = () =>
    Object.entries(COUNTRIES_STATIC)
      .map(([code, country]) => ({
        code,
        nameEn: country.name,
        name: getCountryNamePtByCode(code, country.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const loadAllCountries = () => {
    setAllCountries(buildFallbackCountries());
  };

  const loadPersonalizedExplore = async (user) => {
    const [photosResult, interactionsResult, wishlistResult, followsResult] = await Promise.all([
      supabase.from('country_photos').select('id, photo_url, city, country_name, country_code, location_name, rating, review, created_at, user_id').eq('is_public', true).order('created_at', { ascending: false }).limit(80),
      user ? supabase.from('explore_interactions').select('country_code, event_type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
      user ? supabase.from('wishlist').select('country_code').eq('user_id', user.id) : Promise.resolve({ data: [] }),
      user ? supabase.from('followers').select('following_id').eq('follower_id', user.id) : Promise.resolve({ data: [] }),
    ]);
    const photos = photosResult.data || [];
    const followedIds = new Set((followsResult.data || []).map(item => item.following_id));
    const wishlistCodes = new Set((wishlistResult.data || []).map(item => getAlpha3(item.country_code)?.toUpperCase()));
    const interactionScores = {};
    (interactionsResult.data || []).forEach(item => {
      const code = getAlpha3(item.country_code)?.toUpperCase();
      if (code) interactionScores[code] = (interactionScores[code] || 0) + (item.event_type === 'search' ? 5 : item.event_type === 'open' ? 3 : 1);
    });

    const countries = {};
    photos.forEach(photo => {
      const code = getAlpha3(photo.country_code)?.toUpperCase();
      if (!code) return;
      if (!countries[code]) countries[code] = { country_code: code, country_name: photo.country_name, count: 0, totalRating: 0, ratingCount: 0, users: new Set(), score: interactionScores[code] || 0, coverUrl: photo.photo_url, imageSource: 'Comunidade Journi' };
      const entry = countries[code];
      entry.count += 1;
      entry.users.add(photo.user_id);
      entry.score += 1 + (followedIds.has(photo.user_id) ? 3 : 0) + (wishlistCodes.has(code) ? 4 : 0);
      if (photo.rating) { entry.totalRating += photo.rating; entry.ratingCount += 1; }
    });
    const seasonalCodes = SEASONAL_COUNTRIES_BY_MONTH[new Date().getMonth()] || [];
    seasonalCodes.forEach(code => {
      if (countries[code]) return;
      countries[code] = {
        country_code: code,
        country_name: getCountryNamePtByCode(code, COUNTRIES_STATIC[code]?.name || code),
        count: 0,
        totalRating: 0,
        ratingCount: 0,
        users: new Set(),
        score: 0,
        seasonal: true,
      };
    });
    const ranked = Object.values(countries).map(country => ({
      ...country,
      avgRating: country.ratingCount ? (country.totalRating / country.ratingCount).toFixed(1) : null,
      score: country.score + country.users.size * 2 + getSeasonalBoost(country.country_code),
    })).sort((a, b) => b.score - a.score || b.count - a.count);
    const topCountries = await Promise.all(ranked.slice(0, 8).map(async country => {
      if (country.coverUrl) return country;
      const image = await getTourismImage(
        country.country_code,
        COUNTRIES_STATIC[country.country_code]?.name || country.country_name
      );
      return image ? { ...country, coverUrl: image.url, imageSource: image.source } : country;
    }));
    setPopularCountries(topCountries);

    const countryRank = new Map(ranked.map((country, index) => [country.country_code, ranked.length - index]));
    const sortedPhotos = [...photos].sort((a, b) => {
      const aCode = getAlpha3(a.country_code)?.toUpperCase();
      const bCode = getAlpha3(b.country_code)?.toUpperCase();
      const aScore = (countryRank.get(aCode) || 0) + (followedIds.has(a.user_id) ? 10 : 0);
      const bScore = (countryRank.get(bCode) || 0) + (followedIds.has(b.user_id) ? 10 : 0);
      return bScore - aScore || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }).slice(0, 10);
    const userIds = [...new Set(sortedPhotos.map(photo => photo.user_id))];
    const { data: profiles } = userIds.length
      ? await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds)
      : { data: [] };
    setRecentPhotos(sortedPhotos.map(photo => ({ ...photo, country_code: getAlpha3(photo.country_code)?.toUpperCase(), profiles: (profiles || []).find(profile => profile.id === photo.user_id) || null })));
  };

  const recordExploreInteraction = async (countryCode, eventType) => {
    if (!currentUser || !countryCode) return;
    await supabase.from('explore_interactions').insert({ user_id: currentUser.id, country_code: getAlpha3(countryCode)?.toUpperCase(), event_type: eventType });
  };

  const handleCountryPress = async (country) => {
    recordExploreInteraction(country.country_code, 'open');
    setSelectedCountry(country);
    setLoadingPhotos(true);
    try {
      const { data: photos } = await supabase
        .from('country_photos')
        .select('id, photo_url, photo_path, city, created_at, user_id, location_name, rating, review')
        .in('country_code', [getAlpha3(country.country_code)?.toUpperCase(), ALPHA3_TO_ALPHA2[getAlpha3(country.country_code)?.toUpperCase()]].filter(Boolean))
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (photos && photos.length > 0) {
        const userIds = [...new Set(photos.map(p => p.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);
        setCountryPhotos(photos.map(photo => ({
          ...photo,
          profiles: profiles?.find(p => p.id === photo.user_id) || null,
        })));
      } else {
        setCountryPhotos([]);
      }
    } catch (e) {
      setCountryPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleFollowToggle = async (userId) => {
    const isFollowing = following.includes(userId);
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isValidUUID || !currentUser) {
      return;
    }

    const result = isFollowing
      ? await unfollowUser(currentUser.id, userId)
      : await followUser(currentUser.id, userId);

    if (!result.success) {
      Alert.alert('Erro', result.error || 'Não foi possível atualizar este perfil.');
      return;
    }

    setFollowing(prev => isFollowing
      ? prev.filter(id => id !== userId)
      : [...prev, userId]);
  };

  const handleDeleteCountryPhoto = async photo => {
    if (!photo || photo.user_id !== currentUser?.id || deletingPhotoId) return;
    const accepted = await confirm(
      'Excluir publicação',
      'A foto, a legenda e os comentários serão excluídos permanentemente. Deseja continuar?'
    );
    if (!accepted) return;

    setDeletingPhotoId(photo.id);
    const result = await deletePhoto(photo.id, photo.photo_path);
    setDeletingPhotoId(null);
    if (!result.success) {
      notify('Erro ao excluir', result.error || 'Não foi possível excluir esta publicação.');
      return;
    }
    setCountryPhotos(current => current.filter(item => item.id !== photo.id));
    setFullscreenPhoto(null);
    notify('Publicação excluída', 'Sua foto foi removida.');
    loadPersonalizedExplore(currentUser);
  };

  useEffect(() => {
    if (selectedCountry) {
      isInWishlist(selectedCountry.country_code).then(r => setCountryWishlisted(r.data || false));
    } else {
      setCountryWishlisted(false);
    }
  }, [selectedCountry]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, COUNTRY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedSearchQuery.length >= 2 && currentUser) {
      searchTravelers(debouncedSearchQuery, currentUser.id).then(r => {
        if (r.success) setTravelerSearchResults(r.data);
      });
    } else {
      setTravelerSearchResults([]);
    }
  }, [debouncedSearchQuery, currentUser]);

  const toggleCountryWishlist = async () => {
    if (!selectedCountry) return;
    if (countryWishlisted) {
      await removeFromWishlist(selectedCountry.country_code);
      setCountryWishlisted(false);
    } else {
      await addToWishlist(selectedCountry.country_code, selectedCountry.country_name);
      setCountryWishlisted(true);
    }
  };

  // Mesma regra da busca do mapa: sem acento, casando por prefixo de palavra.
  const searchResults = useMemo(
    () => searchCountries(allCountries, debouncedSearchQuery, 6),
    [allCountries, debouncedSearchQuery]
  );

  return (
    <View style={styles.container}>
      {/* HEADER FIXO */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Explorar</Text>
        <Text style={styles.headerSub}>Descubra destinos e viajantes</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar destinos ou pessoas..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>
        {/* RESULTADOS DA BUSCA */}
        {(travelerSearchResults.length > 0 || searchResults.length > 0) && (
          <View style={styles.searchResults}>
            {travelerSearchResults.map((traveler, i) => (
              <TouchableOpacity
                key={`t-${traveler.id}`}
                style={[styles.searchResultItem, { borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' }]}
                onPress={() => {
                  setSearchQuery('');
                  navigation.navigate('PublicProfile', { userId: traveler.id, username: traveler.username });
                }}
              >
                <Avatar profile={traveler} size={24} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultText}>{traveler.display_name || traveler.username}</Text>
                  {traveler.matchedCountry && (
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Visitou {traveler.matchedCountry}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.followBtn, following.includes(traveler.id) && styles.followBtnActive]}
                  onPress={() => handleFollowToggle(traveler.id)}
                >
                  <Text style={[styles.followBtnText, following.includes(traveler.id) && styles.followBtnTextActive]}>
                    {following.includes(traveler.id) ? 'Seguindo' : 'Seguir'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            {searchResults.map((country, i) => (
              <TouchableOpacity
                key={`c-${i}`}
                style={[styles.searchResultItem, i < searchResults.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' }]}
                onPress={() => {
                  recordExploreInteraction(country.code, 'search');
                  handleCountryPress({ country_code: country.code, country_name: country.nameEn });
                  setSearchQuery('');
                }}
              >
                <CountryFlag countryCode={country.code} width={28} height={19} borderRadius={3} />
                <Text style={styles.searchResultText}>{country.name}</Text>
                <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* CONTEÚDO SCROLLÁVEL */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: tabBarPadding }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#6C2BD9" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* SUGERIDOS PARA VOCÊ */}
            {suggestedTravelers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>SUGERIDOS PARA VOCÊ</Text>
                <FlatList
                  data={suggestedTravelers}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={item => item.id}
                  contentContainerStyle={{ gap: 10 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.suggestedCard}
                      onPress={() => navigation.navigate('PublicProfile', { userId: item.id, username: item.username })}
                      activeOpacity={0.85}
                    >
                      <Avatar profile={item} size={44} />
                      <Text style={styles.suggestedName} numberOfLines={1}>{item.display_name || item.username}</Text>
                      <Text style={styles.suggestedMeta}>
                        {item.commonCountries > 0 ? `${item.commonCountries} países em comum` : `@${item.username}`}
                      </Text>
                      <TouchableOpacity
                        style={[styles.followBtn, following.includes(item.id) && styles.followBtnActive]}
                        onPress={() => handleFollowToggle(item.id)}
                      >
                        <Text style={[styles.followBtnText, following.includes(item.id) && styles.followBtnTextActive]}>
                          {following.includes(item.id) ? 'Seguindo' : 'Seguir'}
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {/* DESTINOS POPULARES */}
            {popularCountries.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>DESTINOS EM ALTA NESTA ÉPOCA</Text>
                <View style={styles.destGrid}>
                  {popularCountries.map((country, i) => (
                    <TouchableOpacity
                      key={country.country_code}
                      style={styles.destinationCard}
                      onPress={() => handleCountryPress(country)}
                      activeOpacity={0.85}
                    >
                      {!!country.coverUrl && (
                        <CachedImage source={country.coverUrl} style={styles.destinationBackground} contentFit="cover" cachePolicy="memory-disk" transition={120} />
                      )}
                      <View style={styles.destinationShade} />
                      <CountryFlag
                        countryCode={country.country_code}
                        width={38}
                        height={25}
                        borderRadius={4}
                        style={styles.destinationFlag}
                      />
                      <Text style={styles.destName} numberOfLines={1}>
                        {getCountryNamePtByCode(country.country_code, country.country_name)}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.destCount}>
                          {country.count
                            ? `${country.count} ${country.count === 1 ? 'foto' : 'fotos'}`
                            : 'Tendência sazonal'}
                        </Text>
                        {country.avgRating && (
                          <Text style={styles.destRating}>★ {country.avgRating}</Text>
                        )}
                      </View>
                      {!!country.imageSource && <Text style={styles.imageSource}>{country.imageSource}</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* FOTOS PERSONALIZADAS */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FOTOS RECOMENDADAS PARA VOCÊ</Text>
              {recentPhotos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.recentCard}
                  onPress={() => setFullscreenPhoto(photo)}
                  activeOpacity={0.95}
                >
                  <CachedImage
                    source={photo.photo_url}
                    style={styles.recentImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                    recyclingKey={photo.id}
                  />
                  <View style={styles.recentInfo}>
                    <View style={styles.recentAuthor}>
                      <Avatar profile={photo.profiles} size={28} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recentAuthorName}>{photo.profiles?.display_name}</Text>
                        <Text style={styles.recentAuthorHandle}>@{photo.profiles?.username}</Text>
                      </View>
                      <Text style={styles.recentDate}>
                        {new Date(photo.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </Text>
                    </View>

                    {photo.location_name && (
                      <View style={styles.recentLocationRow}>
                        <Ionicons name="location" size={11} color="#6C2BD9" />
                        <Text style={styles.recentLocationName} numberOfLines={1}>
                          {photo.location_name}
                        </Text>
                        <Text style={styles.recentCity}>· {photo.city}</Text>
                      </View>
                    )}

                    {photo.rating > 0 && (
                      <View style={{ marginBottom: 6 }}>
                        <StarRating rating={photo.rating} size={13} />
                      </View>
                    )}

                    {photo.review && (
                      <Text style={styles.recentReview} numberOfLines={2}>
                        "{photo.review}"
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* VIAJANTES */}
            {(discoverUsers.length > 0 || MOCK_USERS.length > 0) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>VIAJANTES</Text>
              {(discoverUsers.length > 0 ? discoverUsers : MOCK_USERS).map((user, i) => {
                const list = discoverUsers.length > 0 ? discoverUsers : MOCK_USERS;
                return (
                <View
                  key={user.id}
                  style={[styles.userRow, i === list.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={() => navigation.navigate('PublicProfile', { userId: user.id, username: user.username })}
                  >
                    <Avatar profile={user} size={40} />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{user.display_name || user.username}</Text>
                      <Text style={styles.userMeta}>@{user.username} · {user.countries} países</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.followBtn, following.includes(user.id) && styles.followBtnActive]}
                    onPress={() => handleFollowToggle(user.id)}
                  >
                    <Text style={[styles.followBtnText, following.includes(user.id) && styles.followBtnTextActive]}>
                      {following.includes(user.id) ? 'Seguindo' : 'Seguir'}
                    </Text>
                  </TouchableOpacity>
                </View>
                );
              })}
            </View>
            )}
          </>
        )}
      </ScrollView>

      {/* MODAL DO PAÍS */}
      <Modal
        visible={selectedCountry !== null}
        animationType="slide"
        onRequestClose={() => setSelectedCountry(null)}
      >
        <View style={{ flex: 1, backgroundColor: '#f0f0f0' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedCountry(null)}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {selectedCountry && (
                <CountryFlag
                  countryCode={selectedCountry.country_code}
                  width={32}
                  height={21}
                  borderRadius={3}
                />
              )}
              <Text style={styles.modalHeaderTitle}>
                {selectedCountry
                  ? getCountryNamePtByCode(
                      selectedCountry.country_code,
                      selectedCountry.country_name
                    )
                  : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={toggleCountryWishlist} style={{ padding: 4 }}>
              <Ionicons
                name={countryWishlisted ? 'heart' : 'heart-outline'}
                size={22}
                color={countryWishlisted ? '#FF4D6D' : 'rgba(255,255,255,0.6)'}
              />
            </TouchableOpacity>
          </View>

          {loadingPhotos ? (
            <ActivityIndicator color="#6C2BD9" style={{ marginTop: 40 }} />
          ) : countryPhotos.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
              <Ionicons name="images-outline" size={48} color="#ddd" />
              <Text style={{ color: '#aaa', fontSize: 14, fontWeight: '500' }}>
                Nenhuma foto pública neste país ainda
              </Text>
              <Text style={{ color: '#ccc', fontSize: 12 }}>
                Seja o primeiro a compartilhar!
              </Text>
            </View>
          ) : (
            <FlatList
              data={countryPhotos}
              keyExtractor={photo => photo.id}
              contentContainerStyle={{ padding: 12, gap: 10 }}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              renderItem={({ item: photo }) => (
                <TouchableOpacity
                  style={styles.photoCard}
                  onPress={() => setFullscreenPhoto(photo)}
                  activeOpacity={0.95}
                >
                  <CachedImage
                    source={photo.photo_url}
                    style={styles.photoCardImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                    recyclingKey={photo.id}
                  />
                  <View style={styles.photoCardInfo}>
                    <View style={styles.photoCardAuthor}>
                      <Avatar profile={photo.profiles} size={28} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.photoCardName}>
                          {photo.profiles?.display_name || photo.profiles?.username || 'Viajante'}
                        </Text>
                        <Text style={styles.photoCardHandle}>
                          @{photo.profiles?.username || ''}
                        </Text>
                      </View>
                      <Text style={styles.photoCardDate}>
                        {photo.created_at
                          ? new Date(photo.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                          : ''}
                      </Text>
                    </View>

                    {(photo.rating > 0 || photo.location_name) && (
                      <View style={styles.photoRatingRow}>
                        {photo.location_name && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 }}>
                            <Ionicons name="location" size={11} color="#6C2BD9" />
                            <Text style={styles.photoLocationName} numberOfLines={1}>
                              {photo.location_name}
                            </Text>
                            {photo.city && (
                              <Text style={styles.photoCity}>· {photo.city}</Text>
                            )}
                          </View>
                        )}
                        {photo.rating > 0 && (
                          <View style={{ marginBottom: photo.review ? 4 : 0 }}>
                            <StarRating rating={photo.rating} size={13} />
                          </View>
                        )}
                        {photo.review && (
                          <Text style={styles.photoReview} numberOfLines={3}>
                            "{photo.review}"
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      {/* FULLSCREEN */}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <View style={styles.fullscreen}>
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenPhoto(null)}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          {!!fullscreenPhoto && fullscreenPhoto.user_id === currentUser?.id && (
            <TouchableOpacity
              style={styles.fullscreenDelete}
              onPress={() => handleDeleteCountryPhoto(fullscreenPhoto)}
              disabled={deletingPhotoId === fullscreenPhoto?.id}
              accessibilityLabel="Excluir minha publicação"
            >
              {deletingPhotoId === fullscreenPhoto?.id
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="trash-outline" size={23} color="#fff" />}
            </TouchableOpacity>
          )}
          {fullscreenPhoto && (
            <>
              <CachedImage
                source={fullscreenPhoto.photo_url}
                style={{ width: '100%', height: '70%' }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <View style={styles.fullscreenInfo}>
                {fullscreenPhoto.location_name && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons name="location" size={13} color="#6C2BD9" />
                    <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                      {fullscreenPhoto.location_name}
                    </Text>
                  </View>
                )}
                {fullscreenPhoto.rating > 0 && (
                  <View style={{ marginBottom: 6 }}>
                    <StarRating rating={fullscreenPhoto.rating} size={16} inactiveColor="rgba(255,255,255,0.3)" />
                  </View>
                )}
                {fullscreenPhoto.review && (
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontStyle: 'italic', marginBottom: 6 }}>
                    "{fullscreenPhoto.review}"
                  </Text>
                )}
                {fullscreenPhoto.city && (
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                    {fullscreenPhoto.city}
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
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  header: { backgroundColor: '#0D1326', padding: 20, paddingTop: 48, paddingBottom: 16 },
  headerTitle: { color: 'white', fontSize: 22, fontWeight: '700', fontFamily: 'Poppins_700Bold', letterSpacing: -0.3 },
  headerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  searchInput: { flex: 1, color: 'white', fontSize: 13 },
  searchResults: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, marginTop: 8, overflow: 'hidden' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  searchResultText: { flex: 1, color: 'white', fontSize: 13, fontWeight: '500' },
  body: { flex: 1 },
  section: {
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
    padding: 12,
    paddingBottom: 0,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 10 },
  destGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  destinationCard: {
    width: '47.5%',
    minHeight: 190,
    backgroundColor: '#1b1f3a',
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  destinationBackground: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  destinationShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,11,25,0.48)' },
  destinationFlag: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  destCard: { width: '47.5%', height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: '#ddd' },
  destFlag: { width: '100%', height: '100%' },
  destOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: 8 },
  destName: { color: 'white', fontSize: 13, fontWeight: '700' },
  destCount: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  destRating: { color: '#6C2BD9', fontSize: 10, fontWeight: '600' },
  imageSource: { color: 'rgba(255,255,255,0.58)', fontSize: 8 },
  card: { backgroundColor: 'white', borderRadius: 12, margin: 12, padding: 14 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#f0f0f0' },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  userAvatarText: { color: 'white', fontWeight: '700', fontSize: 15 },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '600', color: '#0D1326' },
  userMeta: { fontSize: 11, color: '#aaa', marginTop: 1 },
  followBtn: { backgroundColor: '#6C2BD9', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  followBtnActive: { backgroundColor: '#f0f0f0' },
  followBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  followBtnTextActive: { color: '#999' },
  modalHeader: { backgroundColor: '#0D1326', padding: 16, paddingTop: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeaderTitle: { color: 'white', fontSize: 16, fontWeight: '700' },
  photoCard: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', marginBottom: 2 },
  photoCardImage: { width: '100%', height: 200 },
  photoCardInfo: { padding: 12 },
  photoCardAuthor: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  photoCardAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6C2BD9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoCardAvatarText: { color: 'white', fontSize: 11, fontWeight: '700' },
  photoCardName: { fontSize: 13, fontWeight: '600', color: '#0D1326' },
  photoCardHandle: { fontSize: 11, color: '#aaa' },
  photoCardDate: { fontSize: 11, color: '#bbb' },
  photoRatingRow: { borderTopWidth: 0.5, borderTopColor: '#f5f5f5', paddingTop: 10 },
  photoLocationName: { fontSize: 12, fontWeight: '600', color: '#6C2BD9', flex: 1 },
  photoCity: { fontSize: 10, color: '#aaa' },
  photoReview: { fontSize: 12, color: '#666', fontStyle: 'italic', lineHeight: 18 },
  fullscreen: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  fullscreenClose: { position: 'absolute', top: 48, right: 20, zIndex: 10 },
  fullscreenDelete: { position: 'absolute', top: 48, left: 20, zIndex: 10, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center' },
  fullscreenInfo: { position: 'absolute', bottom: 60, alignItems: 'center', paddingHorizontal: 20 },
  recentCard: { backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', marginBottom: 10, borderWidth: 0.5, borderColor: '#f0f0f0' },
  recentImage: { width: '100%', height: 180 },
  recentInfo: { padding: 12 },
  recentAuthor: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  recentAuthorName: { fontSize: 13, fontWeight: '600', color: '#0D1326' },
  recentAuthorHandle: { fontSize: 11, color: '#aaa' },
  recentDate: { fontSize: 11, color: '#bbb' },
  recentLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  recentLocationName: { fontSize: 12, fontWeight: '600', color: '#6C2BD9', flex: 1 },
  recentCity: { fontSize: 11, color: '#aaa' },
  recentReview: { fontSize: 12, color: '#666', fontStyle: 'italic', lineHeight: 18 },
  suggestedCard: {
    width: 120,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    ...Platform.select({
      web: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  suggestedName: { fontSize: 12, fontWeight: '700', color: '#0D1326', textAlign: 'center' },
  suggestedMeta: { fontSize: 10, color: '#aaa', textAlign: 'center' },
});
