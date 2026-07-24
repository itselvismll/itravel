import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert, Platform, TextInput, Image, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/constants';
import { supabase, getCurrentUser, getVisitedCountries, markCountryAsVisited, unmarkCountryAsVisited } from '../../services/supabase';
import { isInWishlist, addToWishlist, removeFromWishlist, getWishlist } from '../../services/socialService';
import { getCountryInfo, formatPopulation, formatArea, getBorderCountries } from '../../services/countriesApi';
import { getCountryCulturalData } from '../../data/countriesData';
import {
  ALPHA3_TO_ALPHA2,
  getAlpha2,
  getCountryNamePtByCode,
} from '../../utils/countryUtils';
import {
  getGeoCountryAlpha2,
  getGeoCountryAlpha3,
  getGeoCountryName,
} from '../../utils/geo-country-utils';
import { PROMPT_TYPES, askTravelAssistant } from '../../services/assistantService';
import PhotoGallery from '../../components/PhotoGallery';
import PhotoUploader from '../../components/PhotoUploader';
import CountryFlag from '../../components/CountryFlag';
import { useUpload } from '../../context/UploadContext';
import { getCoverPhoto, getTopPlacesByCountry } from '../../services/photoService';
import { getWorldGeoData } from '../../services/geoService';
import Svg, { Path, Circle } from 'react-native-svg';

const ALPHA2_TO_ALPHA3 = Object.fromEntries(
  Object.entries(ALPHA3_TO_ALPHA2).map(([k, v]) => [v, k])
);

const normalizeToAlpha2 = (code) =>
  getAlpha2(code)?.toUpperCase() || code?.toUpperCase();

const COUNTRIES_LIST = [
  { code: 'BR', name: 'Brasil' }, { code: 'AR', name: 'Argentina' },
  { code: 'US', name: 'Estados Unidos' }, { code: 'FR', name: 'França' },
  { code: 'IT', name: 'Itália' }, { code: 'ES', name: 'Espanha' },
  { code: 'PT', name: 'Portugal' }, { code: 'DE', name: 'Alemanha' },
  { code: 'GB', name: 'Reino Unido' }, { code: 'JP', name: 'Japão' },
  { code: 'CN', name: 'China' }, { code: 'KR', name: 'Coreia do Sul' },
  { code: 'TH', name: 'Tailândia' }, { code: 'VN', name: 'Vietnã' },
  { code: 'ID', name: 'Indonésia' }, { code: 'AU', name: 'Austrália' },
  { code: 'NZ', name: 'Nova Zelândia' }, { code: 'MX', name: 'México' },
  { code: 'CO', name: 'Colômbia' }, { code: 'PE', name: 'Peru' },
  { code: 'CL', name: 'Chile' }, { code: 'UY', name: 'Uruguai' },
  { code: 'PY', name: 'Paraguai' }, { code: 'BO', name: 'Bolívia' },
  { code: 'EC', name: 'Equador' }, { code: 'VE', name: 'Venezuela' },
  { code: 'CA', name: 'Canadá' }, { code: 'ZA', name: 'África do Sul' },
  { code: 'EG', name: 'Egito' }, { code: 'MA', name: 'Marrocos' },
  { code: 'KE', name: 'Quênia' }, { code: 'NG', name: 'Nigéria' },
  { code: 'ET', name: 'Etiópia' }, { code: 'TR', name: 'Turquia' },
  { code: 'GR', name: 'Grécia' }, { code: 'NL', name: 'Holanda' },
  { code: 'BE', name: 'Bélgica' }, { code: 'CH', name: 'Suíça' },
  { code: 'AT', name: 'Áustria' }, { code: 'SE', name: 'Suécia' },
  { code: 'NO', name: 'Noruega' }, { code: 'DK', name: 'Dinamarca' },
  { code: 'FI', name: 'Finlândia' }, { code: 'PL', name: 'Polônia' },
  { code: 'CZ', name: 'República Tcheca' }, { code: 'HU', name: 'Hungria' },
  { code: 'RO', name: 'Romênia' }, { code: 'HR', name: 'Croácia' },
  { code: 'IN', name: 'Índia' }, { code: 'NE', name: 'Níger' },
  { code: 'LY', name: 'Líbia' }, { code: 'DZ', name: 'Argélia' },
  { code: 'RU', name: 'Rússia' }, { code: 'UA', name: 'Ucrânia' },
  { code: 'SG', name: 'Singapura' }, { code: 'MY', name: 'Malásia' },
  { code: 'PH', name: 'Filipinas' }, { code: 'PK', name: 'Paquistão' },
  { code: 'BD', name: 'Bangladesh' }, { code: 'LK', name: 'Sri Lanka' },
  { code: 'NP', name: 'Nepal' }, { code: 'AE', name: 'Emirados Árabes' },
  { code: 'SA', name: 'Arábia Saudita' }, { code: 'IL', name: 'Israel' },
  { code: 'JO', name: 'Jordânia' }, { code: 'CU', name: 'Cuba' },
  { code: 'DO', name: 'República Dominicana' }, { code: 'CR', name: 'Costa Rica' },
  { code: 'PA', name: 'Panamá' }, { code: 'GT', name: 'Guatemala' },
  { code: 'IS', name: 'Islândia' }, { code: 'IE', name: 'Irlanda' },
];

let MapContainer, GeoJSON, TileLayer, Marker, Popup, L, MarkerClusterGroup;
if (Platform.OS === 'web') {
  require('../../utils/leafletSetup');
  const leaflet = require('react-leaflet');
  MapContainer = leaflet.MapContainer;
  GeoJSON = leaflet.GeoJSON;
  TileLayer = leaflet.TileLayer;
  Marker = leaflet.Marker;
  Popup = leaflet.Popup;
  const leafletLib = require('leaflet');
  L = leafletLib.default || leafletLib;
  MarkerClusterGroup = require('react-leaflet-cluster').default;
}



export default function MapScreen({ navigation }) {
  const [countries, setCountries] = useState(null);
  const [visitedCountries, setVisitedCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalLoading, setModalLoading] = useState(false);
  const [countryDetails, setCountryDetails] = useState(null);
  const [borderCountries, setBorderCountries] = useState([]);
  const [user, setUser] = useState(null);
  const [showUploader, setShowUploader] = useState(false);
  const [coverPhotos, setCoverPhotos] = useState({});
  const [currentCoverPhotoId, setCurrentCoverPhotoId] = useState(null);
  const [cityPins, setCityPins] = useState([]);
  const [cityIcon, setCityIcon] = useState(null);
  const [pinSelectedCity, setPinSelectedCity] = useState(null);
  const [showCountryInfo, setShowCountryInfo] = useState(false);
  const [modalPhotoStats, setModalPhotoStats] = useState({ photoCount: 0, cityCount: 0, favoriteCount: 0 });
  const [topPlaces, setTopPlaces] = useState({});
  const [countrySearch, setCountrySearch] = useState('');
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [wishlistCodes, setWishlistCodes] = useState([]);
  const [assistantVisible, setAssistantVisible] = useState(false);
  const [selectedPromptType, setSelectedPromptType] = useState(null);
  const [assistantDestination, setAssistantDestination] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantStep, setAssistantStep] = useState('select');
  const [countrySuggestions, setCountrySuggestions] = useState([]);

  const visitedCountriesDataRef = useRef([]);

  const { refreshTrigger } = useUpload();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const leaflet = require('leaflet');
    const L = leaflet.default || leaflet;

    if (!L || !L.divIcon) {
      return;
    }

    try {
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width: 38px;
          height: 38px;
          background: linear-gradient(135deg, #00D1C1, #6C2BD9);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 3px 8px rgba(0,0,0,0.4);
          border: 2px solid white;
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -32],
      });
      setCityIcon(icon);
    } catch {
      setCityIcon(null);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) {
      loadData();
    }
  }, [refreshTrigger]);

  useEffect(() => {
    if (modalVisible && selectedCountry) {
      isInWishlist(selectedCountry.code).then(r => setIsWishlisted(r.data || false));
    } else {
      setIsWishlisted(false);
    }
  }, [modalVisible, selectedCountry]);

  useFocusEffect(
    React.useCallback(() => {
      const loadWishlist = async () => {
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) return;
          const wishlistResult = await getWishlist(authUser.id);
          if (wishlistResult.success) {
            const codes = wishlistResult.data.map(w => {
              const upper = w.country_code.toUpperCase();
              return ALPHA2_TO_ALPHA3[upper] || upper;
            });
            setWishlistCodes(codes);
          }
        } catch {
          setWishlistCodes([]);
        }
      };
      loadWishlist();
    }, [])
  );

  const loadData = async () => {
    try {
      setLoading(true);

      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const result = await getVisitedCountries(currentUser.id);
        if (result.success) {
          visitedCountriesDataRef.current = result.data;
          const codes = result.data.map(v => normalizeToAlpha2(v.country_code));
          setVisitedCountries([...new Set(codes)]);

          const coverEntries = await Promise.all(
            codes.map(async (code) => {
              const coverResult = await getCoverPhoto(currentUser.id, code);
              if (coverResult.success && coverResult.data?.cover_photo_url) {
                return [code, coverResult.data.cover_photo_url];
              }
              return null;
            })
          );
          setCoverPhotos(Object.fromEntries(coverEntries.filter(Boolean)));

          await loadCityPinsForUser(currentUser.id);

          const wlResult = await getWishlist(currentUser.id);
          if (wlResult.success) {
            const codes = wlResult.data.map(w => {
              const upper = w.country_code.toUpperCase();
              return ALPHA2_TO_ALPHA3[upper] || upper;
            });
            setWishlistCodes(codes);
          }
        }
      }

      const geoData = await getWorldGeoData();
      setCountries(geoData);

    } catch {
      Alert.alert('Erro', 'Não foi possível carregar o mapa');
    } finally {
      setLoading(false);
    }
  };

  const loadCityPinsForUser = async (userId) => {
    const { data: photosWithCity } = await supabase
      .from('country_photos')
      .select('city, city_lat, city_lng, photo_url, country_code')
      .eq('user_id', userId)
      .not('city_lat', 'is', null);

    if (photosWithCity) {
      const citiesMap = {};
      photosWithCity.forEach(photo => {
        const key = `${normalizeToAlpha2(photo.country_code)}:${photo.city}`;
        if (!citiesMap[key]) {
          citiesMap[key] = {
            city: photo.city,
            lat: photo.city_lat,
            lng: photo.city_lng,
            countryCode: normalizeToAlpha2(photo.country_code),
            photos: [],
          };
        }
        citiesMap[key].photos.push(photo.photo_url);
      });
      setCityPins(Object.values(citiesMap));
    }
  };

  const handleCountryClick = useCallback(async (feature) => {
    const countryCode = getGeoCountryAlpha3(feature);
    const countryName = getCountryNamePtByCode(
      countryCode,
      getGeoCountryName(feature)
    );

    if (!countryCode) {
      Alert.alert('País não identificado', 'Não foi possível identificar este país.');
      return;
    }

    setSelectedCountry({ code: countryCode, name: countryName });

    const countryCodeAlpha2 = ALPHA3_TO_ALPHA2[countryCode] || countryCode;
    const visitedEntry = visitedCountriesDataRef.current.find(
      v => normalizeToAlpha2(v.country_code) === countryCodeAlpha2
    );
    setCurrentCoverPhotoId(visitedEntry?.cover_photo_id ?? null);

    setModalVisible(true);
    setModalLoading(true);
    setCountryDetails(null);
    setBorderCountries([]);
    setShowCountryInfo(false);
    setModalPhotoStats({ photoCount: 0, cityCount: 0, favoriteCount: 0 });
    setTopPlaces({});

    try {
      const [apiData, topResult] = await Promise.all([
        getCountryInfo(countryCode),
        getTopPlacesByCountry(countryCode),
      ]);
      const culturalData = getCountryCulturalData(countryCode);
      const borders = await getBorderCountries(apiData.borders);
      setCountryDetails({ ...apiData, cultural: culturalData });
      setBorderCountries(borders);
      if (topResult.success) setTopPlaces(topResult.data);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar os detalhes deste país.');
    } finally {
      setModalLoading(false);
    }
  }, []);

  const toggleVisited = async () => {
    if (!user || !selectedCountry) return;

    const countryCodeAlpha2 = ALPHA3_TO_ALPHA2[selectedCountry.code] || selectedCountry.code;
    const isVisited = visitedCountries.includes(countryCodeAlpha2);

    try {
      if (isVisited) {
        const result = await unmarkCountryAsVisited(user.id, selectedCountry.code);
        if (result.success) {
          setVisitedCountries(prev => prev.filter(c => c !== countryCodeAlpha2));
          Alert.alert('✅ Removido', `${selectedCountry.name} foi removido dos países visitados`);
        }
      } else {
        const result = await markCountryAsVisited(user.id, selectedCountry.code, selectedCountry.name);
        if (result.success) {
          setVisitedCountries(prev => [...new Set([...prev, countryCodeAlpha2])]);
          Alert.alert('🎉 Marcado!', `${selectedCountry.name} foi adicionado aos países visitados!`);
        }
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o país');
    }
  };

  const toggleWishlist = async () => {
    if (!selectedCountry) return;
    if (isWishlisted) {
      await removeFromWishlist(selectedCountry.code);
      setIsWishlisted(false);
      setWishlistCodes(prev => prev.filter(c => c !== selectedCountry.code));
    } else {
      await addToWishlist(selectedCountry.code, selectedCountry.name);
      setIsWishlisted(true);
      setWishlistCodes(prev => [...prev, selectedCountry.code]);
    }
  };

  const searchResults = countrySearch.length >= 2 && countries
    ? countries.features
        .filter(f =>
          getGeoCountryName(f).toLowerCase().includes(countrySearch.toLowerCase()) ||
          getGeoCountryAlpha3(f)?.toLowerCase().includes(countrySearch.toLowerCase())
        )
        .slice(0, 5)
    : [];

  const visitedCount = visitedCountries.length;
  const totalCountries = 195;
  const visitedPercentage = totalCountries > 0 ? (visitedCount / totalCountries) * 100 : 0;
  const notVisitedCount = totalCountries - visitedCount;
  const geoJsonStyle = (feature) => {
    const code = getGeoCountryAlpha3(feature);
    const alpha2 = getGeoCountryAlpha2(feature);
    const isVisited = visitedCountries.includes(alpha2);
    const isWishlist = wishlistCodes.includes(code);
    return {
      fillColor: isVisited ? COLORS.primary : isWishlist ? '#FFFFFF' : '#0D1326',
      fillOpacity: isVisited ? 0.7 : isWishlist ? 0.6 : 0.3,
      color: '#444444',
      weight: 0.5,
    };
  };

  const onEachFeature = (feature, layer) => {
    const code = getGeoCountryAlpha3(feature);
    const alpha2 = getGeoCountryAlpha2(feature);
    const isVisited = visitedCountries.includes(alpha2);
    const isWishlist = wishlistCodes.includes(code);

    layer.on({
      mouseover: (e) => {
        e.target.setStyle({
          fillOpacity: 0.9,
          fillColor: isVisited ? COLORS.primary : isWishlist ? '#F0F0F0' : '#2a2a4e',
        });
        setHoveredCountry(getGeoCountryName(feature));
      },
      mouseout: (e) => {
        e.target.setStyle({
          fillOpacity: isVisited ? 0.7 : isWishlist ? 0.6 : 0.3,
          fillColor: isVisited ? COLORS.primary : isWishlist ? '#FFFFFF' : '#0D1326',
        });
        setHoveredCountry(null);
      },
      click: () => handleCountryClick(feature),
    });
  };

  const handlePinClick = useCallback((pin) => {
    const countryFeature = countries?.features?.find(c => {
      const alpha3 = getGeoCountryAlpha3(c);
      const alpha2 = getGeoCountryAlpha2(c);
      return alpha2 === pin.countryCode || alpha3 === pin.countryCode;
    });

    if (countryFeature) {
      setPinSelectedCity(pin.city);
      handleCountryClick(countryFeature);
    }
  }, [countries, handleCountryClick]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Carregando mapa...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Badge do país em hover */}
      {hoveredCountry && (
        <View style={styles.hoverBadge}>
          <Text style={styles.hoverText}>{hoveredCountry}</Text>
        </View>
      )}

      {/* Barra do assistente de viagem */}
      <TouchableOpacity
        onPress={() => {
          setAssistantStep('select');
          setSelectedPromptType(null);
          setAssistantDestination('');
          setAssistantVisible(true);
        }}
        style={{
          position: 'absolute', top: 16, left: 16, right: 16, zIndex: 1000,
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: 'rgba(13,19,38,0.92)',
          borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
          borderWidth: 1, borderColor: 'rgba(108,43,217,0.4)',
          ...Platform.select({
            web: { boxShadow: '0 2px 8px rgba(108,43,217,0.3)' },
            default: {
              shadowColor: '#6C2BD9',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 5,
            },
          }),
        }}
      >
        <Ionicons name="sparkles-outline" size={18} color="#6C2BD9" />
        <Text style={{ color: '#9aa0c6', fontSize: 14, flex: 1 }}>
          ✈️ Planejar viagem com IA...
        </Text>
      </TouchableOpacity>

      {/* Gráfico circular de estatísticas */}
      <View style={styles.statsCard}>
        <View style={styles.circleChart}>
          <Svg width="80" height="80">
            <Circle cx={40} cy={40} r={32} fill="none" stroke="#E0E0E0" strokeWidth={8} />
            <Circle
              cx={40} cy={40} r={32}
              fill="none"
              stroke={COLORS.primary}
              strokeWidth={8}
              strokeDasharray={`${(visitedPercentage / 100) * 201} 201`}
              strokeDashoffset={0}
              transform="rotate(-90 40 40)"
            />
          </Svg>
          <View style={styles.circleChartLabel} pointerEvents="none">
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.text }}>{visitedPercentage.toFixed(1)}%</Text>
            <Text style={{ fontSize: 8, color: COLORS.gray }}>do mundo</Text>
          </View>
        </View>
        <View style={styles.statsDetails}>
          <View style={styles.statRow}>
            <View style={[styles.statDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.statText}>{visitedCount} visitados</Text>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.statDot, { backgroundColor: '#E0E0E0' }]} />
            <Text style={styles.statText}>{notVisitedCount} restantes</Text>
          </View>
        </View>
      </View>

      {/* Logo Journi sobreposto ao mapa */}
      <View style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}>
        <Image
          source={require('../../../assets/journi_simbolo.png')}
          style={{ width: 28, height: 28 }}
          resizeMode="contain"
        />
        <Text style={{ fontSize: 16, fontWeight: '900', color: 'white', letterSpacing: -0.5 }}>
          Journi
        </Text>
      </View>

      {/* Mapa Leaflet */}
      <View style={{ flex: 1 }}>
        {process.env.EXPO_OS !== 'web' ? (
          <View style={{ flex: 1, backgroundColor: '#0D1326', paddingTop: 12 }}>
            <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 4 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>Explore os países</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                Selecione um destino para ver detalhes e registrar sua viagem.
              </Text>
            </View>
            <ScrollView
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 8 }}
            >
              {(countries?.features || [])
                .filter(feature => {
                  return Boolean(getGeoCountryAlpha3(feature));
                })
                .sort((a, b) => getGeoCountryName(a).localeCompare(getGeoCountryName(b)))
                .map(feature => {
                  const code = getGeoCountryAlpha3(feature);
                  const alpha2 = getGeoCountryAlpha2(feature);
                  const isVisited = visitedCountries.includes(alpha2);
                  const sourceName = getGeoCountryName(feature) || code;
                  const name = getCountryNamePtByCode(code, sourceName);
                  return (
                    <TouchableOpacity
                      key={code}
                      onPress={() => handleCountryClick(feature)}
                      activeOpacity={0.75}
                      style={{
                        minHeight: 52,
                        borderRadius: 14,
                        borderCurve: 'continuous',
                        paddingHorizontal: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        backgroundColor: isVisited ? 'rgba(108,43,217,0.28)' : 'rgba(255,255,255,0.07)',
                        borderWidth: 1,
                        borderColor: isVisited ? '#6C2BD9' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <CountryFlag countryCode={code} width={28} height={19} borderRadius={3} />
                      <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{name}</Text>
                      {isVisited && <Ionicons name="checkmark-circle" size={20} color="#00D1C1" />}
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        ) : (
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          maxZoom={8}
          style={{ width: '100%', height: '100%' }}
          worldCopyJump={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains='abcd'
            maxZoom={20}
          />
          {countries && (
            <GeoJSON
              key={visitedCountries.join(',') + '|' + wishlistCodes.join(',')}
              data={countries}
              style={geoJsonStyle}
              onEachFeature={onEachFeature}
            />
          )}
          {cityIcon && MarkerClusterGroup && (
            <MarkerClusterGroup
              key={cityPins.length}
              maxClusterRadius={60}
              showCoverageOnHover={false}
              zoomToBoundsOnClick={true}
              spiderfyOnMaxZoom={true}
              chunkedLoading={true}
              iconCreateFunction={(cluster) => {
                const Lref = L;
                return Lref.divIcon({
                  html: `<div style="background:#6C2BD9;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${cluster.getChildCount()}</div>`,
                  className: '',
                  iconSize: [36, 36],
                  iconAnchor: [18, 18],
                });
              }}
            >
              {cityPins.map((pin, index) => (
                <Marker
                  key={`pin-${index}`}
                  position={[pin.lat, pin.lng]}
                  icon={cityIcon}
                  eventHandlers={{ click: () => handlePinClick(pin) }}
                />
              ))}
            </MarkerClusterGroup>
          )}
        </MapContainer>
        )}
      </View>

      {/* Modal de detalhes do país */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => { setModalVisible(false); setShowUploader(false); setTopPlaces({}); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {modalLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.modalLoadingText}>Carregando informações...</Text>
              </View>
            ) : countryDetails ? (
              <>
                {/* Header escuro */}
                <View style={styles.modalHeader}>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={() => { setModalVisible(false); setShowUploader(false); setTopPlaces({}); }}
                  >
                    <Ionicons name="close" size={18} color="white" />
                  </TouchableOpacity>

                  <CountryFlag
                    countryCode={selectedCountry?.code}
                    width={72}
                    height={48}
                    borderRadius={8}
                    style={styles.modalFlag}
                  />

                  <Text style={styles.modalCountryName}>{countryDetails.name}</Text>
                  <Text style={styles.modalCountrySub}>
                    {countryDetails.region} · {countryDetails.subregion}
                  </Text>

                  <View style={styles.statsRow}>
                    <View style={styles.statPill}>
                      <Text style={styles.statValue}>{modalPhotoStats.photoCount}</Text>
                      <Text style={styles.statLabel}>fotos</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statValue}>{modalPhotoStats.cityCount}</Text>
                      <Text style={styles.statLabel}>cidades</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statValue}>{modalPhotoStats.favoriteCount}</Text>
                      <Text style={styles.statLabel}>favoritas</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.visitedBtn} onPress={toggleVisited}>
                    <Ionicons
                      name={visitedCountries.includes(ALPHA3_TO_ALPHA2[selectedCountry?.code] || selectedCountry?.code) ? 'checkmark-circle' : 'add-circle-outline'}
                      size={16}
                      color={visitedCountries.includes(ALPHA3_TO_ALPHA2[selectedCountry?.code] || selectedCountry?.code) ? '#4ade80' : 'rgba(255,255,255,0.6)'}
                    />
                    <Text style={[
                      styles.visitedBtnText,
                      { color: visitedCountries.includes(ALPHA3_TO_ALPHA2[selectedCountry?.code] || selectedCountry?.code) ? '#4ade80' : 'rgba(255,255,255,0.6)' }
                    ]}>
                      {visitedCountries.includes(ALPHA3_TO_ALPHA2[selectedCountry?.code] || selectedCountry?.code) ? 'Já visitei ✓' : 'Marcar como visitado'}
                    </Text>
                  </TouchableOpacity>

                  {!visitedCountries.includes(ALPHA3_TO_ALPHA2[selectedCountry?.code] || selectedCountry?.code) && (
                    <TouchableOpacity
                      onPress={toggleWishlist}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        marginTop: 12, paddingVertical: 12, paddingHorizontal: 20,
                        borderRadius: 12,
                        backgroundColor: '#1b1f3a',
                        borderWidth: 1.5, borderColor: isWishlisted ? '#FFFFFF' : '#6C2BD9',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>🗺️</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: isWishlisted ? '#FFFFFF' : '#6C2BD9', letterSpacing: 0.5 }}>
                        {isWishlisted ? 'Na wishlist ✓' : 'Quero visitar'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Scroll com fundo cinza */}
                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>

                  {/* Accordion "Sobre o país" */}
                  <TouchableOpacity
                    style={styles.accordionHeader}
                    onPress={() => setShowCountryInfo(!showCountryInfo)}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.accordionIcon}>🌍</Text>
                      <Text style={styles.accordionTitle}>Sobre o país</Text>
                    </View>
                    <Ionicons name={showCountryInfo ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                  </TouchableOpacity>

                  {showCountryInfo && (
                    <View style={styles.accordionBody}>
                      <View style={styles.infoGrid}>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Capital</Text>
                          <Text style={styles.infoValue}>{countryDetails.capital || '-'}</Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>População</Text>
                          <Text style={styles.infoValue}>
                            {countryDetails.population
                              ? (countryDetails.population / 1000000).toFixed(1) + 'M'
                              : '-'}
                          </Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Idioma</Text>
                          <Text style={styles.infoValue} numberOfLines={1}>
                            {countryDetails.languages?.[0] || '-'}
                          </Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Moeda</Text>
                          <Text style={styles.infoValue} numberOfLines={1}>
                            {countryDetails.currencies?.[0]
                              ? `${countryDetails.currencies[0].symbol || ''} ${countryDetails.currencies[0].name}`
                              : '-'}
                          </Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Código</Text>
                          <Text style={styles.infoValue}>{countryDetails.phoneCode || '-'}</Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Área</Text>
                          <Text style={styles.infoValue}>
                            {countryDetails.area
                              ? (countryDetails.area / 1000000).toFixed(1) + 'M km²'
                              : '-'}
                          </Text>
                        </View>
                      </View>

                      {countryDetails.cultural?.foods?.length > 0 && (
                        <View style={styles.infoSection}>
                          <Text style={styles.infoSectionTitle}>🍕 Comidas típicas</Text>
                          <View style={styles.tagsRow}>
                            {countryDetails.cultural.foods.map((item, i) => (
                              <View key={i} style={styles.tag}>
                                <Text style={styles.tagText}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {countryDetails.cultural?.attractions?.length > 0 && (
                        <View style={styles.infoSection}>
                          <Text style={styles.infoSectionTitle}>🗺️ Pontos turísticos</Text>
                          <View style={styles.tagsRow}>
                            {countryDetails.cultural.attractions.map((item, i) => (
                              <View key={i} style={[styles.tag, styles.tagOrange]}>
                                <Text style={[styles.tagText, { color: '#6C2BD9' }]}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {borderCountries.length > 0 && (
                        <View style={styles.infoSection}>
                          <Text style={styles.infoSectionTitle}>🌍 Países vizinhos ({borderCountries.length})</Text>
                          {borderCountries.slice(0, 3).map((border, i) => (
                            <View key={i} style={styles.neighborRow}>
                              <CountryFlag
                                countryCode={border.code}
                                width={24}
                                height={16}
                                borderRadius={2}
                                style={{ marginRight: 8 }}
                              />
                              <Text style={styles.neighborName}>{border.name}</Text>
                            </View>
                          ))}
                          {borderCountries.length > 3 && (
                            <Text style={{ color: '#6C2BD9', fontSize: 11, marginTop: 4 }}>
                              + {borderCountries.length - 3} países
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Top Lugares por cidade */}
                  {Object.keys(topPlaces).length > 0 && (
                    <View style={{ marginHorizontal: 12, marginTop: 10 }}>
                      {Object.entries(topPlaces).map(([city, places]) => (
                        <View key={city} style={styles.topPlacesCard}>
                          <Text style={styles.topPlacesTitle}>🏆 Top lugares em {city}</Text>
                          {places.map((place, i) => (
                            <View key={place.name} style={styles.topPlaceRow}>
                              <Text style={styles.topPlaceRank}>{i + 1}º</Text>
                              <Text style={styles.topPlaceName} numberOfLines={1}>{place.name}</Text>
                              <View style={styles.topPlaceRatingBox}>
                                <Ionicons name="star" size={11} color="#FFD700" />
                                <Text style={styles.topPlaceRating}>{place.avgRating.toFixed(1)}</Text>
                              </View>
                              <Text style={styles.topPlaceCount}>({place.count})</Text>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Seção de fotos */}
                  <View style={styles.photosSection}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>📸 Suas Fotos</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.addPhotoBtn}
                      onPress={() => setShowUploader(true)}
                    >
                      <Ionicons name="camera-outline" size={18} color="#6C2BD9" />
                      <Text style={styles.addPhotoBtnText}>Adicionar foto</Text>
                    </TouchableOpacity>

                    <PhotoGallery
                      countryCode={selectedCountry.code}
                      countryName={selectedCountry.name}
                      userId={user?.id}
                      coverPhotoId={currentCoverPhotoId}
                      scrollToCity={pinSelectedCity}
                      onScrollToCityDone={() => setPinSelectedCity(null)}
                      onStatsUpdate={(stats) => setModalPhotoStats(stats)}
                      onCoverPhotoSet={(newPhotoId, newPhotoUrl) => {
                        setCurrentCoverPhotoId(newPhotoId);

                        const alpha2 = ALPHA3_TO_ALPHA2[selectedCountry.code] || selectedCountry.code;

                        setCoverPhotos(prev => {
                          const updated = { ...prev };
                          if (newPhotoUrl) {
                            updated[alpha2] = newPhotoUrl;
                          } else {
                            delete updated[alpha2];
                          }
                          return updated;
                        });

                        const entryIndex = visitedCountriesDataRef.current.findIndex(
                          v => v.country_code === alpha2
                        );
                        if (entryIndex !== -1) {
                          visitedCountriesDataRef.current[entryIndex].cover_photo_id = newPhotoId;
                          visitedCountriesDataRef.current[entryIndex].cover_photo_url = newPhotoUrl;
                        }
                      }}
                    />
                  </View>

                  <View style={{ height: 40 }} />
                </ScrollView>
              </>
            ) : (
              <View style={styles.modalError}>
                <Ionicons name="alert-circle-outline" size={64} color={COLORS.error} />
                <Text style={styles.modalErrorText}>Não foi possível carregar as informações</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal do assistente de viagem */}
      <Modal
        visible={assistantVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssistantVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={{
              backgroundColor: '#11162b', borderTopLeftRadius: 24,
              borderTopRightRadius: 24, padding: 20, paddingBottom: 40,
              borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)'
            }}>
              <View style={{ width: 40, height: 4, borderRadius: 2,
                backgroundColor: '#2a2f50', alignSelf: 'center', marginBottom: 20 }} />

              {assistantStep === 'select' && (
                <>
                  <Text style={{ fontSize: 18, fontWeight: '700',
                    color: '#F7F7F2', marginBottom: 4 }}>
                    Assistente de Viagem ✨
                  </Text>
                  <Text style={{ fontSize: 13, color: '#9aa0c6', marginBottom: 20 }}>
                    O que você precisa para sua próxima aventura?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {PROMPT_TYPES.map(type => (
                      <TouchableOpacity
                        key={type.id}
                        onPress={() => {
                          setSelectedPromptType(type);
                          setAssistantStep('destination');
                        }}
                        style={{
                          width: '47%', backgroundColor: '#1b1f3a',
                          borderRadius: 14, padding: 14,
                          borderWidth: 1.5, borderColor: type.color, gap: 4
                        }}
                      >
                        <Text style={{ fontSize: 24 }}>{type.emoji}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700',
                          color: '#F7F7F2' }}>{type.title}</Text>
                        <Text style={{ fontSize: 11, color: '#9aa0c6' }}>
                          {type.description}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {assistantStep === 'destination' && selectedPromptType && (
                <>
                  <TouchableOpacity
                    onPress={() => setAssistantStep('select')}
                    style={{ flexDirection: 'row', alignItems: 'center',
                      gap: 6, marginBottom: 16 }}
                  >
                    <Ionicons name="arrow-back" size={18} color="#9aa0c6" />
                    <Text style={{ color: '#9aa0c6' }}>Voltar</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center',
                    gap: 10, marginBottom: 20, backgroundColor: '#1b1f3a',
                    borderRadius: 12, padding: 12,
                    borderWidth: 1, borderColor: selectedPromptType.color }}>
                    <Text style={{ fontSize: 22 }}>{selectedPromptType.emoji}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700',
                      color: selectedPromptType.color }}>
                      {selectedPromptType.title}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700',
                    color: '#9aa0c6', letterSpacing: 1, marginBottom: 10 }}>
                    QUAL O DESTINO?
                  </Text>
                  <TextInput
                    value={assistantDestination}
                    onChangeText={(text) => {
                      setAssistantDestination(text);
                      if (text.length >= 1) {
                        const filtered = COUNTRIES_LIST.filter(c =>
                          c.name.toLowerCase().includes(text.toLowerCase()) ||
                          c.code.toLowerCase().includes(text.toLowerCase())
                        ).slice(0, 5);
                        setCountrySuggestions(filtered);
                      } else {
                        setCountrySuggestions([]);
                      }
                    }}
                    placeholder="Ex: Brasil, Japão, França..."
                    placeholderTextColor="#555a78"
                    style={{
                      backgroundColor: '#1b1f3a', borderRadius: 12,
                      padding: 14, fontSize: 15, color: '#F7F7F2',
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                      marginBottom: countrySuggestions.length > 0 ? 0 : 14
                    }}
                    autoFocus
                  />
                  {countrySuggestions.length > 0 && (
                    <View style={{
                      backgroundColor: '#1b1f3a',
                      borderWidth: 1, borderTopWidth: 0,
                      borderColor: 'rgba(255,255,255,0.08)',
                      borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
                      marginBottom: 14, overflow: 'hidden'
                    }}>
                      {countrySuggestions.map((country, idx) => (
                        <TouchableOpacity
                          key={country.code}
                          onPress={() => {
                            setAssistantDestination(country.name);
                            setCountrySuggestions([]);
                          }}
                          style={{
                            flexDirection: 'row', alignItems: 'center',
                            gap: 12, padding: 12,
                            borderTopWidth: idx > 0 ? 1 : 0,
                            borderTopColor: 'rgba(255,255,255,0.06)'
                          }}
                        >
                          <CountryFlag
                            countryCode={country.code}
                            width={28}
                            height={19}
                            borderRadius={3}
                          />
                          <Text style={{ fontSize: 14, color: '#F7F7F2', fontWeight: '600' }}>
                            {country.name}
                          </Text>
                          <Text style={{ fontSize: 12, color: '#9aa0c6', marginLeft: 'auto' }}>
                            {country.code}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    disabled={!assistantDestination.trim() || assistantLoading}
                    onPress={async () => {
                      if (!assistantDestination.trim() || !selectedPromptType) return;
                      setAssistantLoading(true);
                      try {
                        const { data: { user: authUser } } = await supabase.auth.getUser();
                        if (!authUser) {
                          Alert.alert(
                            'Sessão expirada',
                            'Entre novamente para usar o assistente de viagem.'
                          );
                          return;
                        }

                        const [countriesRes, wishlistRes] = await Promise.all([
                          supabase.from('visited_countries')
                            .select('country_name').eq('user_id', authUser.id),
                          getWishlist(authUser.id),
                        ]);
                        const visited = (countriesRes.data || []).map(c => c.country_name);
                        const wishlist = (wishlistRes.data || []).map(c => c.country_name);
                        const levels = [
                          { max: 2, name: 'Iniciante' },
                          { max: 5, name: 'Viajante' },
                          { max: 10, name: 'Explorador' },
                          { max: 20, name: 'Globetrotter' },
                          { max: 999, name: 'Lenda Viajante' },
                        ];
                        const level = levels.find(l => visited.length <= l.max)?.name || 'Lenda Viajante';
                        const result = await askTravelAssistant({
                          promptType: selectedPromptType.id,
                          destination: assistantDestination.trim(),
                          userContext: {
                            visitedCountries: visited,
                            wishlistCountries: wishlist,
                            totalCountries: visited.length,
                            level,
                          },
                        });
                        if (result.success) {
                          setAssistantVisible(false);
                          navigation.navigate('AssistantResult', {
                            promptType: selectedPromptType.id,
                            destination: assistantDestination.trim(),
                            response: result.response,
                          });
                        } else {
                          Alert.alert('Erro', result.error);
                        }
                      } catch {
                        Alert.alert(
                          'Erro',
                          'Não foi possível gerar o conteúdo agora. Tente novamente.'
                        );
                      } finally {
                        setAssistantLoading(false);
                      }
                    }}
                    style={{
                      backgroundColor: assistantDestination.trim() ? '#6C2BD9' : '#2a2f50',
                      borderRadius: 12, padding: 15,
                      alignItems: 'center', flexDirection: 'row',
                      justifyContent: 'center', gap: 8
                    }}
                  >
                    {assistantLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="sparkles" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                          Gerar com IA
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal de upload de foto */}
      <Modal
        visible={showUploader}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowUploader(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'white' }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 16,
            paddingTop: 20,
            borderBottomWidth: 0.5,
            borderBottomColor: '#f0f0f0',
          }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: '#0D1326' }}>
              Adicionar foto
            </Text>
            <TouchableOpacity onPress={() => setShowUploader(false)}>
              <Ionicons name="close" size={24} color="#0D1326" />
            </TouchableOpacity>
          </View>
          <ScrollView>
            <View style={{ padding: 16 }}>
              <PhotoUploader
                countryCode={selectedCountry?.code}
                countryName={selectedCountry?.name}
                countryNameEn={countryDetails?.name || selectedCountry?.name}
                userId={user?.id}
                onPhotoUploaded={() => {
                  setShowUploader(false);
                  loadData();
                }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  searchContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 1001,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(26,26,46,0.88)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    color: 'white',
    fontSize: 13,
  },
  searchDropdown: {
    backgroundColor: 'rgba(26,26,46,0.96)',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchResultBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchResultText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  searchResultCode: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.gray,
  },
  statsCard: {
    position: 'absolute',
    top: 76,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 5,
    zIndex: 1000,
    minWidth: 140,
  },
  circleChart: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  circleChartLabel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsDetails: {
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statText: {
    fontSize: 11,
    color: COLORS.text,
  },
  hoverBadge: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    zIndex: 1000,
  },
  hoverText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0D1326',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingTop: 20,
  },
  modalHeader: {
    backgroundColor: '#0D1326',
    padding: 18,
    paddingTop: 24,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFlag: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  modalCountryName: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -0.3,
  },
  modalCountrySub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    width: '100%',
  },
  statPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6C2BD9',
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  visitedBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  visitedBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalLoading: {
    padding: 60,
    alignItems: 'center',
  },
  modalLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.gray,
  },
  modalScroll: {
    backgroundColor: '#f0f0f0',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 14,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
  },
  accordionIcon: {
    fontSize: 16,
  },
  accordionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D1326',
  },
  accordionBody: {
    backgroundColor: 'white',
    marginHorizontal: 12,
    marginTop: 2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  infoItem: {
    width: '47%',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 8,
  },
  infoLabel: {
    fontSize: 9,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D1326',
  },
  infoSection: {
    marginTop: 12,
  },
  infoSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D1326',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  tag: {
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  tagOrange: {
    backgroundColor: '#fff3ee',
  },
  tagText: {
    fontSize: 10,
    color: '#444',
    fontWeight: '500',
  },
  neighborRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  neighborName: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
  },
  photosSection: {
    backgroundColor: 'white',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    minHeight: 200,
  },
  countryHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  countryName: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  countryOfficialName: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 4,
  },
  visitedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  visitedButtonActive: {
    backgroundColor: COLORS.success,
  },
  visitedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: COLORS.background,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
  },
  bordersContainer: {
    gap: 10,
  },
  borderCountry: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  borderCountryName: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  moreText: {
    fontSize: 13,
    color: COLORS.gray,
    fontStyle: 'italic',
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    justifyContent: 'center',
  },
  addPhotoBtnText: {
    color: '#6C2BD9',
    fontSize: 14,
    fontWeight: '600',
  },
  topPlacesCard: {
    backgroundColor: '#fffbf0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: '#fde68a',
  },
  topPlacesTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 8,
  },
  topPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  topPlaceRank: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6C2BD9',
    width: 20,
  },
  topPlaceName: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  topPlaceRatingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  topPlaceRating: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400e',
  },
  topPlaceCount: {
    fontSize: 10,
    color: '#999',
  },
  modalError: {
    padding: 60,
    alignItems: 'center',
  },
  modalErrorText: {
    fontSize: 16,
    color: COLORS.error,
    marginTop: 16,
    textAlign: 'center',
  },
});
