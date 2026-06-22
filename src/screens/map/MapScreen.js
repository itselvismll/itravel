import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, ActivityIndicator, Alert, Platform, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/constants';
import { supabase, getCurrentUser, getVisitedCountries, markCountryAsVisited, unmarkCountryAsVisited } from '../../services/supabase';
import { getCountryInfo, formatPopulation, formatArea, getBorderCountries } from '../../services/countriesApi';
import { getCountryCulturalData } from '../../data/countriesData';
import { ALPHA3_TO_ALPHA2, getAlpha2 } from '../../utils/countryUtils';
import PhotoGallery from '../../components/PhotoGallery';
import PhotoUploader from '../../components/PhotoUploader';
import { useUpload } from '../../context/UploadContext';
import { getCoverPhoto, getTopPlacesByCountry } from '../../services/photoService';
import Svg, { Path, Circle } from 'react-native-svg';

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



export default function MapScreen() {
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

  const visitedCountriesDataRef = useRef([]);

  const { refreshTrigger } = useUpload();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const leaflet = require('leaflet');
    const L = leaflet.default || leaflet;

    console.log('📍 L dentro do useEffect:', typeof L, L?.version);

    if (!L || !L.divIcon) {
      console.error('❌ L.divIcon não disponível');
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
      console.log('✅ cityIcon criado com sucesso!');
    } catch (e) {
      console.error('❌ Erro ao criar cityIcon:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (refreshTrigger > 0) {
      loadData();
      loadCityPins();
    }
  }, [refreshTrigger]);

  const loadData = async () => {
    try {
      setLoading(true);

      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const result = await getVisitedCountries(currentUser.id);
        if (result.success) {
          visitedCountriesDataRef.current = result.data;
          const codes = result.data.map(v => ALPHA3_TO_ALPHA2[v.country_code] || v.country_code);
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
        }
      }

      const response = await fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson');
      const geoData = await response.json();
      setCountries(geoData);

    } catch (error) {
      console.error('❌ Erro ao carregar dados:', error);
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
        const key = photo.city;
        if (!citiesMap[key]) {
          citiesMap[key] = {
            city: photo.city,
            lat: photo.city_lat,
            lng: photo.city_lng,
            countryCode: ALPHA3_TO_ALPHA2[photo.country_code] || photo.country_code,
            photos: [],
          };
        }
        citiesMap[key].photos.push(photo.photo_url);
      });
      setCityPins(Object.values(citiesMap));
    }
  };

  const loadCityPins = useCallback(async () => {
    if (!user) return;
    const { data: photosWithCity, error } = await supabase
      .from('country_photos')
      .select('city, city_lat, city_lng, photo_url, country_code')
      .eq('user_id', user.id)
      .not('city_lat', 'is', null);

    console.log('📍 photosWithCity:', photosWithCity?.length, error?.message);

    if (photosWithCity) {
      const citiesMap = {};
      photosWithCity.forEach(photo => {
        const key = photo.city;
        if (!citiesMap[key]) {
          citiesMap[key] = {
            city: photo.city,
            lat: photo.city_lat,
            lng: photo.city_lng,
            countryCode: ALPHA3_TO_ALPHA2[photo.country_code] || photo.country_code,
            photos: [],
          };
        }
        citiesMap[key].photos.push(photo.photo_url);
      });
      console.log('📍 pins criados:', Object.values(citiesMap).length);
      setCityPins(Object.values(citiesMap));
    }
  }, [user]);

  const handleCountryClick = useCallback(async (feature) => {
    const countryCode = feature.properties['ISO3166-1-Alpha-3'];
    const countryName = feature.properties.name;

    if (!countryCode || countryCode === '-99') {
      Alert.alert('País não identificado', 'Não foi possível identificar este país.');
      return;
    }

    setSelectedCountry({ code: countryCode, name: countryName });

    const countryCodeAlpha2 = ALPHA3_TO_ALPHA2[countryCode] || countryCode;
    const visitedEntry = visitedCountriesDataRef.current.find(v => v.country_code === countryCodeAlpha2);
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
    } catch (error) {
      console.error('❌ Erro ao buscar detalhes:', error);
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
    } catch (error) {
      console.error('❌ Erro ao atualizar país:', error);
      Alert.alert('Erro', 'Não foi possível atualizar o país');
    }
  };

  const searchResults = countrySearch.length >= 2 && countries
    ? countries.features
        .filter(f =>
          f.properties?.ADMIN?.toLowerCase().includes(countrySearch.toLowerCase()) ||
          f.properties?.['ISO3166-1-Alpha-3']?.toLowerCase().includes(countrySearch.toLowerCase())
        )
        .slice(0, 5)
    : [];

  const visitedCount = visitedCountries.length;
  const totalCountries = 195;
  const visitedPercentage = totalCountries > 0 ? ((visitedCount / totalCountries) * 100).toFixed(1) : 0;
  const notVisitedCount = totalCountries - visitedCount;
  console.log('📊 visitedCountries:', visitedCountries);
  console.log('📊 visitedCount:', visitedCount);

  const geoJsonStyle = (feature) => {
    const code = feature.properties['ISO3166-1-Alpha-3'];
    const alpha2 = ALPHA3_TO_ALPHA2[code] || code;
    const isVisited = visitedCountries.includes(alpha2);
    return {
      fillColor: isVisited ? COLORS.primary : '#0D1326',
      fillOpacity: isVisited ? 0.7 : 0.3,
      color: '#444444',
      weight: 0.5,
    };
  };

  const onEachFeature = (feature, layer) => {
    const code = feature.properties['ISO3166-1-Alpha-3'];
    const alpha2 = ALPHA3_TO_ALPHA2[code] || code;
    const isVisited = visitedCountries.includes(alpha2);

    layer.on({
      mouseover: (e) => {
        e.target.setStyle({
          fillOpacity: 0.9,
          fillColor: isVisited ? COLORS.primary : '#2a2a4e',
        });
        setHoveredCountry(feature.properties.name);
      },
      mouseout: (e) => {
        e.target.setStyle({
          fillOpacity: isVisited ? 0.7 : 0.3,
          fillColor: isVisited ? COLORS.primary : '#0D1326',
        });
        setHoveredCountry(null);
      },
      click: () => handleCountryClick(feature),
    });
  };

  const handlePinClick = useCallback((pin) => {
    const countryFeature = countries?.features?.find(c => {
      const alpha3 = c.properties['ISO3166-1-Alpha-3'];
      const alpha2 = ALPHA3_TO_ALPHA2[alpha3] || alpha3;
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

  if (typeof window === 'undefined') return null;

  return (
    <View style={styles.container}>
      {/* Badge do país em hover */}
      {hoveredCountry && (
        <View style={styles.hoverBadge}>
          <Text style={styles.hoverText}>{hoveredCountry}</Text>
        </View>
      )}

      {/* Barra de busca de países */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={15} color="rgba(255,255,255,0.5)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar país..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={countrySearch}
            onChangeText={setCountrySearch}
          />
          {countrySearch.length > 0 && (
            <TouchableOpacity onPress={() => setCountrySearch('')}>
              <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>
        {searchResults.length > 0 && (
          <View style={styles.searchDropdown}>
            {searchResults.map((feature, i) => {
              const code = feature.properties['ISO3166-1-Alpha-3'];
              const name = feature.properties.ADMIN;
              const alpha2 = getAlpha2(code);
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.searchResultItem, i < searchResults.length - 1 && styles.searchResultBorder]}
                  onPress={() => {
                    setCountrySearch('');
                    handleCountryClick(feature);
                  }}
                >
                  <Image
                    source={{ uri: `https://flagcdn.com/w40/${alpha2}.png` }}
                    style={{ width: 22, height: 15, borderRadius: 2 }}
                  />
                  <Text style={[styles.searchResultText, { flex: 1 }]}>{name}</Text>
                  <Ionicons name="chevron-forward" size={13} color="rgba(255,255,255,0.3)" />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Gráfico circular de estatísticas */}
      <View style={styles.statsCard}>
        <View style={styles.circleChart}>
          <svg width="80" height="80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="#E0E0E0" strokeWidth="8" />
            <circle
              cx="40" cy="40" r="32"
              fill="none"
              stroke={COLORS.primary}
              strokeWidth="8"
              strokeDasharray={`${(visitedPercentage / 100) * 201} 201`}
              strokeDashoffset="0"
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
            <text x="40" y="38" textAnchor="middle" fontSize="16" fontWeight="700" fill={COLORS.text}>
              {visitedPercentage}%
            </text>
            <text x="40" y="50" textAnchor="middle" fontSize="8" fill={COLORS.gray}>
              do mundo
            </text>
          </svg>
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
          style={{ width: 28, height: 28, resizeMode: 'contain' }}
        />
        <Text style={{ fontSize: 16, fontWeight: '900', color: 'white', letterSpacing: -0.5 }}>
          Journi
        </Text>
      </View>

      {/* Mapa Leaflet */}
      <View style={{ flex: 1 }}>
        {Platform.OS !== 'web' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D1326' }}>
            <Ionicons name="map-outline" size={48} color="#6C2BD9" />
            <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 13 }}>
              Mapa disponível na versão web
            </Text>
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
              key={visitedCountries.join(',')}
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

                  {countryDetails.flag ? (
                    <img
                      src={countryDetails.flag}
                      alt="flag"
                      style={{ width: 72, height: 48, objectFit: 'cover', borderRadius: 6, marginBottom: 8 }}
                    />
                  ) : (
                    <Text style={styles.modalFlag}>🌍</Text>
                  )}

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
                              {border.flag && (
                                <img
                                  src={border.flag}
                                  alt={border.name}
                                  style={{ width: 24, height: 16, objectFit: 'cover', borderRadius: 2, marginRight: 8 }}
                                />
                              )}
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
                        console.log('⭐ onCoverPhotoSet recebido:', { newPhotoId, newPhotoUrl });

                        setCurrentCoverPhotoId(newPhotoId);

                        const alpha2 = ALPHA3_TO_ALPHA2[selectedCountry.code] || selectedCountry.code;

                        setCoverPhotos(prev => {
                          const updated = { ...prev };
                          if (newPhotoUrl) {
                            updated[alpha2] = newPhotoUrl;
                          } else {
                            delete updated[alpha2];
                          }
                          console.log('🗺️ coverPhotos atualizado:', updated);
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
                  loadCityPins();
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
    outline: 'none',
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
    alignItems: 'center',
    marginBottom: 12,
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
    fontSize: 52,
    marginBottom: 8,
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
  infoLabel: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
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
