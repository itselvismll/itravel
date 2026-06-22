import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, TextInput,
  StyleSheet, ActivityIndicator, Modal, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../services/supabase';
import { getCurrentUser } from '../../services/supabase';
import { getAlpha2, ALPHA3_TO_ALPHA2 } from '../../utils/countryUtils';
import { followUser, unfollowUser, getFollowing, getRecentPublicPhotos, getUsersToDiscover } from '../../services/followService';
import { logger } from '../../utils/logger';
import StarRating from '../../components/StarRating';
import Avatar from '../../components/Avatar';
import { useUpload } from '../../context/UploadContext';

const COUNTRY_NAMES_PT = {
  'Afghanistan': 'Afeganistão', 'Albania': 'Albânia', 'Algeria': 'Argélia',
  'Angola': 'Angola', 'Argentina': 'Argentina', 'Australia': 'Austrália',
  'Austria': 'Áustria', 'Belgium': 'Bélgica', 'Bolivia': 'Bolívia',
  'Brazil': 'Brasil', 'Bulgaria': 'Bulgária', 'Canada': 'Canadá',
  'Chile': 'Chile', 'China': 'China', 'Colombia': 'Colômbia',
  'Croatia': 'Croácia', 'Cuba': 'Cuba', 'Czech Republic': 'República Tcheca',
  'Czechia': 'República Tcheca', 'Denmark': 'Dinamarca', 'Ecuador': 'Equador',
  'Egypt': 'Egito', 'Ethiopia': 'Etiópia', 'Finland': 'Finlândia',
  'France': 'França', 'Germany': 'Alemanha', 'Greece': 'Grécia',
  'Hungary': 'Hungria', 'India': 'Índia', 'Indonesia': 'Indonésia',
  'Iran': 'Irã', 'Iraq': 'Iraque', 'Ireland': 'Irlanda',
  'Israel': 'Israel', 'Italy': 'Itália', 'Jamaica': 'Jamaica',
  'Japan': 'Japão', 'Jordan': 'Jordânia', 'Kenya': 'Quênia',
  'Libya': 'Líbia', 'Malaysia': 'Malásia', 'Mexico': 'México',
  'Morocco': 'Marrocos', 'Netherlands': 'Holanda', 'New Zealand': 'Nova Zelândia',
  'Nigeria': 'Nigéria', 'North Korea': 'Coreia do Norte', 'Norway': 'Noruega',
  'Pakistan': 'Paquistão', 'Panama': 'Panamá', 'Paraguay': 'Paraguai',
  'Peru': 'Peru', 'Philippines': 'Filipinas', 'Poland': 'Polônia',
  'Portugal': 'Portugal', 'Romania': 'Romênia', 'Russia': 'Rússia',
  'Saudi Arabia': 'Arábia Saudita', 'Serbia': 'Sérvia', 'Somalia': 'Somália',
  'South Africa': 'África do Sul', 'South Korea': 'Coreia do Sul',
  'Spain': 'Espanha', 'Sudan': 'Sudão', 'Sweden': 'Suécia',
  'Switzerland': 'Suíça', 'Syria': 'Síria', 'Thailand': 'Tailândia',
  'Tunisia': 'Tunísia', 'Turkey': 'Turquia', 'Türkiye': 'Turquia',
  'Ukraine': 'Ucrânia', 'United Arab Emirates': 'Emirados Árabes',
  'United Kingdom': 'Reino Unido', 'United States of America': 'Estados Unidos',
  'Uruguay': 'Uruguai', 'Venezuela': 'Venezuela', 'Vietnam': 'Vietnã',
  'Tanzania': 'Tanzânia', 'Uganda': 'Uganda', 'Ghana': 'Gana',
  'Cameroon': 'Camarões', 'Mozambique': 'Moçambique',
};

const getCountryNamePt = (name) => COUNTRY_NAMES_PT[name] || name;

const ALPHA3_TO_NAMEEN = {
  'BRA':'Brazil','USA':'United States of America','ARG':'Argentina',
  'PRT':'Portugal','ESP':'Spain','FRA':'France','ITA':'Italy',
  'DEU':'Germany','GBR':'United Kingdom','JPN':'Japan','CHN':'China',
  'MEX':'Mexico','COL':'Colombia','CHL':'Chile','URY':'Uruguay',
  'BOL':'Bolivia','PER':'Peru','VEN':'Venezuela','ECU':'Ecuador',
  'PRY':'Paraguay','CAN':'Canada','AUS':'Australia','NZL':'New Zealand',
  'ZAF':'South Africa','EGY':'Egypt','MAR':'Morocco','NGA':'Nigeria',
  'KEN':'Kenya','THA':'Thailand','VNM':'Vietnam','IDN':'Indonesia',
  'MYS':'Malaysia','SGP':'Singapore','IND':'India','PAK':'Pakistan',
  'RUS':'Russia','UKR':'Ukraine','POL':'Poland','NLD':'Netherlands',
  'BEL':'Belgium','CHE':'Switzerland','AUT':'Austria','SWE':'Sweden',
  'NOR':'Norway','DNK':'Denmark','FIN':'Finland','GRC':'Greece',
  'TUR':'Türkiye','ISR':'Israel','SAU':'Saudi Arabia','ARE':'United Arab Emirates',
  'QAT':'Qatar','KOR':'South Korea','TWN':'Taiwan','HKG':'Hong Kong',
  'CUB':'Cuba','DOM':'Dominican Republic','GTM':'Guatemala',
  'CRI':'Costa Rica','PAN':'Panama','CZE':'Czechia','HUN':'Hungary',
  'ROU':'Romania','BGR':'Bulgaria','HRV':'Croatia','SRB':'Serbia',
  'SVK':'Slovakia','SVN':'Slovenia','PHL':'Philippines','BGD':'Bangladesh',
  'ETH':'Ethiopia','DZA':'Algeria','LBY':'Libya','TUN':'Tunisia',
  'SDN':'Sudan','SOM':'Somalia','GHA':'Ghana','TZA':'Tanzania',
  'UGA':'Uganda','MOZ':'Mozambique','CMR':'Cameroon','ALB':'Albania',
  'BIH':'Bosnia and Herzegovina','MNE':'Montenegro','MDA':'Moldova',
  'BLR':'Belarus','LTU':'Lithuania','LVA':'Latvia','EST':'Estonia',
  'GEO':'Georgia','ARM':'Armenia','AZE':'Azerbaijan','IRL':'Ireland',
  'JAM':'Jamaica','IRN':'Iran','IRQ':'Iraq','SYR':'Syria','JOR':'Jordan',
  'KWT':'Kuwait','AFG':'Afghanistan','NPL':'Nepal','LKA':'Sri Lanka',
  'MMR':'Myanmar','KHM':'Cambodia','LAO':'Laos','PRK':'North Korea',
};

const MOCK_RECENT_PHOTOS = [
  {
    id: 'm1',
    photo_url: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=400',
    city: 'Salvador',
    country_name: 'Brasil',
    country_code: 'BRA',
    location_name: 'Restaurante Yemanjá',
    rating: 5,
    review: 'Melhor moqueca que já comi! Vista pro mar incrível.',
    created_at: '2026-06-01T10:00:00Z',
    profiles: { display_name: 'Maria', username: 'maria_viaja', avatar_url: null },
  },
  {
    id: 'm2',
    photo_url: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=400',
    city: 'Lisboa',
    country_name: 'Portugal',
    country_code: 'PRT',
    location_name: 'Pastéis de Belém',
    rating: 4,
    review: 'O pastel de nata original. Fila grande mas vale cada minuto.',
    created_at: '2026-05-30T14:00:00Z',
    profiles: { display_name: 'João', username: 'joao_mundo', avatar_url: null },
  },
  {
    id: 'm3',
    photo_url: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=400',
    city: 'Tóquio',
    country_name: 'Japan',
    country_code: 'JPN',
    location_name: 'Tsukiji Fish Market',
    rating: 5,
    review: 'Sushi fresquíssimo logo cedo pela manhã. Experiência única!',
    created_at: '2026-05-28T08:00:00Z',
    profiles: { display_name: 'Ana', username: 'ana_travel', avatar_url: null },
  },
  {
    id: 'm4',
    photo_url: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=400',
    city: 'Paris',
    country_name: 'France',
    country_code: 'FRA',
    location_name: 'Tour Eiffel',
    rating: 4,
    review: 'Visão deslumbrante à noite com as luzes. Chegue cedo para evitar filas.',
    created_at: '2026-05-25T20:00:00Z',
    profiles: { display_name: 'Pedro', username: 'pedro_explora', avatar_url: null },
  },
];

const MOCK_POPULAR = [
  { country_code: 'BRA', country_name: 'Brazil', count: 48, avgRating: '4.7' },
  { country_code: 'PRT', country_name: 'Portugal', count: 32, avgRating: '4.9' },
  { country_code: 'JPN', country_name: 'Japan', count: 27, avgRating: '4.8' },
  { country_code: 'FRA', country_name: 'France', count: 21, avgRating: '4.6' },
  { country_code: 'ITA', country_name: 'Italy', count: 18, avgRating: '4.7' },
  { country_code: 'ARG', country_name: 'Argentina', count: 14, avgRating: '4.5' },
];

const MOCK_USERS = [
  { id: '1', username: 'maria_viaja', display_name: 'Maria', avatar_url: null, countries: 12 },
  { id: '2', username: 'joao_mundo', display_name: 'João', avatar_url: null, countries: 8 },
  { id: '3', username: 'ana_travel', display_name: 'Ana', avatar_url: null, countries: 5 },
  { id: '4', username: 'pedro_explora', display_name: 'Pedro', avatar_url: null, countries: 15 },
  { id: '5', username: 'carla_aventura', display_name: 'Carla', avatar_url: null, countries: 3 },
];

export default function ExploreScreen() {
  const [searchQuery, setSearchQuery] = useState('');
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

  const { refreshTrigger } = useUpload();

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (refreshTrigger > 0) loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    setLoading(true);
    const user = await getCurrentUser();
    setCurrentUser(user);

    const parallelTasks = [loadPopularCountries(), loadAllCountries(), loadRecentPhotos()];
    if (user) {
      parallelTasks.push(
        getFollowing(user.id).then(r => { if (r.success) setFollowing(r.data); }),
        getUsersToDiscover(user.id).then(r => { if (r.success) setDiscoverUsers(r.data); }),
      );
    }
    await Promise.all(parallelTasks);
    setLoading(false);
  };

  const loadRecentPhotos = async () => {
    const result = await getRecentPublicPhotos(8);
    if (result.success && result.data.length > 0) {
      setRecentPhotos(result.data);
    } else {
      setRecentPhotos(MOCK_RECENT_PHOTOS);
    }
  };

  const buildFallbackCountries = () =>
    Object.entries(ALPHA3_TO_NAMEEN)
      .map(([code, nameEn]) => ({ code, nameEn, name: COUNTRY_NAMES_PT[nameEn] || nameEn }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const loadAllCountries = async () => {
    try {
      const response = await fetch(
        'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'
      );
      const geoData = await response.json();
      const countries = geoData.features
        .filter(f => f.properties?.ADMIN && f.properties?.['ISO3166-1-Alpha-3'])
        .map(f => ({
          nameEn: f.properties.ADMIN,
          name: getCountryNamePt(f.properties.ADMIN),
          code: f.properties['ISO3166-1-Alpha-3'],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setAllCountries(countries.length > 0 ? countries : buildFallbackCountries());
    } catch (e) {
      console.error('Erro ao carregar países, usando fallback local:', e);
      setAllCountries(buildFallbackCountries());
    }
  };

  const loadPopularCountries = async () => {
    const { data } = await supabase
      .from('country_photos')
      .select('country_code, country_name, rating')
      .eq('is_public', true);

    if (data) {
      const counts = {};
      data.forEach(photo => {
        const key = photo.country_code;
        if (!counts[key]) counts[key] = {
          country_code: key,
          country_name: photo.country_name,
          count: 0,
          totalRating: 0,
          ratingCount: 0,
        };
        counts[key].count++;
        if (photo.rating) {
          counts[key].totalRating += photo.rating;
          counts[key].ratingCount++;
        }
      });
      const sorted = Object.values(counts)
        .map(c => ({
          ...c,
          avgRating: c.ratingCount > 0
            ? (c.totalRating / c.ratingCount).toFixed(1)
            : null,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
      if (!sorted || sorted.length < 3) {
        setPopularCountries(MOCK_POPULAR);
      } else {
        setPopularCountries(sorted);
      }
    } else {
      setPopularCountries(MOCK_POPULAR);
    }
  };

  const handleCountryPress = async (country) => {
    setSelectedCountry(country);
    setLoadingPhotos(true);
    try {
      const { data: photos } = await supabase
        .from('country_photos')
        .select('id, photo_url, city, created_at, user_id, location_name, rating, review')
        .eq('country_code', country.country_code)
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
    if (isFollowing) {
      setFollowing(prev => prev.filter(id => id !== userId));
    } else {
      setFollowing(prev => [...prev, userId]);
    }
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isValidUUID || !currentUser) return;
    if (isFollowing) {
      await unfollowUser(currentUser.id, userId);
    } else {
      await followUser(currentUser.id, userId);
    }
  };

  logger.log('🔍 searchQuery:', searchQuery, '| allCountries:', allCountries.length);
  const searchResults = searchQuery.length >= 2
    ? allCountries.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.nameEn.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 6)
    : [];

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
        {searchResults.length > 0 && (
          <View style={styles.searchResults}>
            {searchResults.map((country, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.searchResultItem, i < searchResults.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' }]}
                onPress={() => {
                  handleCountryPress({ country_code: country.code, country_name: country.nameEn });
                  setSearchQuery('');
                }}
              >
                <Image
                  source={{ uri: `https://flagcdn.com/w40/${getAlpha2(country.code)}.png` }}
                  style={{ width: 22, height: 15, borderRadius: 2 }}
                />
                <Text style={styles.searchResultText}>{country.name}</Text>
                <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* CONTEÚDO SCROLLÁVEL */}
      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#6C2BD9" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* DESTINOS POPULARES */}
            {popularCountries.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>DESTINOS POPULARES</Text>
                <View style={styles.destGrid}>
                  {popularCountries.map((country, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.destCard}
                      onPress={() => handleCountryPress(country)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: `https://flagcdn.com/w160/${getAlpha2(country.country_code)}.png` }}
                        style={styles.destFlag}
                        resizeMode="cover"
                      />
                      <View style={styles.destOverlay}>
                        <Text style={styles.destName}>
                          {getCountryNamePt(country.country_name)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.destCount}>
                            {country.count} {country.count === 1 ? 'foto' : 'fotos'}
                          </Text>
                          {country.avgRating && (
                            <Text style={styles.destRating}>★ {country.avgRating}</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* FOTOS RECENTES */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>FOTOS RECENTES</Text>
              {recentPhotos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.recentCard}
                  onPress={() => setFullscreenPhoto(photo)}
                  activeOpacity={0.95}
                >
                  <Image
                    source={{ uri: photo.photo_url }}
                    style={styles.recentImage}
                    resizeMode="cover"
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
                  <Avatar profile={user} size={40} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.display_name || user.username}</Text>
                    <Text style={styles.userMeta}>@{user.username} · {user.countries} países</Text>
                  </View>
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
            <View style={{ height: 20 }} />
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
                <Image
                  source={{ uri: `https://flagcdn.com/w40/${getAlpha2(selectedCountry.country_code)}.png` }}
                  style={{ width: 26, height: 18, borderRadius: 2 }}
                />
              )}
              <Text style={styles.modalHeaderTitle}>
                {selectedCountry ? getCountryNamePt(selectedCountry.country_name) : ''}
              </Text>
            </View>
            <View style={{ width: 22 }} />
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
            <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
              {countryPhotos.map((photo, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.photoCard}
                  onPress={() => setFullscreenPhoto(photo)}
                  activeOpacity={0.95}
                >
                  <Image
                    source={{ uri: photo.photo_url }}
                    style={styles.photoCardImage}
                    resizeMode="cover"
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
              ))}
            </ScrollView>
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
          {fullscreenPhoto && (
            <>
              <Image
                source={{ uri: fullscreenPhoto.photo_url }}
                style={{ width: '100%', height: '70%' }}
                resizeMode="contain"
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
  section: { padding: 12, paddingBottom: 0 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#999', letterSpacing: 1, marginBottom: 10 },
  destGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  destCard: { width: '47.5%', height: 100, borderRadius: 10, overflow: 'hidden', backgroundColor: '#ddd' },
  destFlag: { width: '100%', height: '100%' },
  destOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', padding: 8 },
  destName: { color: 'white', fontSize: 13, fontWeight: '700' },
  destCount: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  destRating: { color: '#6C2BD9', fontSize: 10, fontWeight: '600' },
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
});
