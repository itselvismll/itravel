// Modal de detalhes do país, aberto pelo mapa principal (GlobeScreen).
//
// Estava inline no mapa Leaflet, que saiu do projeto quando o globo virou o mapa
// principal. Saiu de lá inteiro, sem mudança de comportamento: mesmos serviços,
// mesma ordem de chamadas, mesmo layout, mesmos textos. O que o componente
// ganhou foi uma fronteira — ele recebe o país selecionado e devolve as mudanças
// por callback, em vez de escrever direto no estado da tela.
//
// Por que o carregamento mora AQUI e não em cada tela: buscar país, lugares,
// dados culturais e vizinhos é o que faz o modal existir. Deixar isso na tela
// obrigaria as duas a repetir a sequência, e a primeira divergência entre elas
// seria um bug que só aparece num dos mapas.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/constants';
import { markCountryAsVisited, unmarkCountryAsVisited } from '../../services/supabase';
import { isInWishlist, addToWishlist, removeFromWishlist } from '../../services/socialService';
import { getCountryInfo, getBorderCountries } from '../../services/countriesApi';
import { getCountryCulturalData } from '../../data/countriesData';
import { ALPHA3_TO_ALPHA2 } from '../../utils/countryUtils';
import { getTopPlacesByCountry } from '../../services/photoService';
import PhotoGallery from '../PhotoGallery';
import PhotoUploader from '../PhotoUploader';
import CountryFlag from '../CountryFlag';
import CountryRequirementsCard from '../CountryRequirementsCard';

const EMPTY_PHOTO_STATS = { photoCount: 0, cityCount: 0, favoriteCount: 0 };

/**
 * @param {{
 *   visible: boolean,
 *   country: { code: string, name: string } | null,
 *   user: { id: string } | null,
 *   isVisited: boolean,
 *   coverPhotoId: string | null,
 *   scrollToCity?: string | null,
 *   onScrollToCityDone?: () => void,
 *   onClose: () => void,
 *   onVisitedChange: (alpha2: string, isVisited: boolean) => void,
 *   onWishlistChange: (alpha3: string, inWishlist: boolean) => void,
 *   onCoverPhotoSet?: (photoId: string, photoUrl: string) => void,
 *   onPhotoUploaded?: () => void,
 * }} props
 */
export default function CountryDetailModal({
  visible,
  country,
  user,
  isVisited,
  coverPhotoId,
  scrollToCity = null,
  onScrollToCityDone,
  onClose,
  onVisitedChange,
  onWishlistChange,
  onCoverPhotoSet,
  onPhotoUploaded,
}) {
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState(null);
  const [borderCountries, setBorderCountries] = useState([]);
  const [topPlaces, setTopPlaces] = useState({});
  const [photoStats, setPhotoStats] = useState(EMPTY_PHOTO_STATS);
  const [showCountryInfo, setShowCountryInfo] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);

  const code = country?.code;

  // Mesma sequência que o mapa anterior fazia no handleCountryClick: zera o
  // que era do país anterior e busca tudo em paralelo, com os vizinhos
  // dependendo da resposta da API de países.
  useEffect(() => {
    if (!visible || !code) return undefined;

    let cancelled = false;

    setLoading(true);
    setDetails(null);
    setBorderCountries([]);
    setShowCountryInfo(false);
    setPhotoStats(EMPTY_PHOTO_STATS);
    setTopPlaces({});

    (async () => {
      try {
        const [apiData, topResult] = await Promise.all([
          getCountryInfo(code),
          getTopPlacesByCountry(code),
        ]);
        const culturalData = getCountryCulturalData(code);
        const borders = await getBorderCountries(apiData.borders);
        if (cancelled) return;

        setDetails({ ...apiData, cultural: culturalData });
        setBorderCountries(borders);
        if (topResult.success) setTopPlaces(topResult.data);
      } catch {
        if (!cancelled) Alert.alert('Erro', 'Não foi possível carregar os detalhes deste país.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, code]);

  useEffect(() => {
    if (visible && code) {
      isInWishlist(code).then((r) => setIsWishlisted(r.data || false));
    } else {
      setIsWishlisted(false);
    }
  }, [visible, code]);

  const handleClose = useCallback(() => {
    setShowUploader(false);
    setTopPlaces({});
    onClose?.();
  }, [onClose]);

  const toggleVisited = async () => {
    if (!user || !country) return;

    const countryCodeAlpha2 = ALPHA3_TO_ALPHA2[country.code] || country.code;

    try {
      if (isVisited) {
        const result = await unmarkCountryAsVisited(user.id, country.code);
        if (result.success) {
          onVisitedChange?.(countryCodeAlpha2, false);
          Alert.alert('✅ Removido', `${country.name} foi removido dos países visitados`);
        }
      } else {
        const result = await markCountryAsVisited(user.id, country.code, country.name);
        if (result.success) {
          onVisitedChange?.(countryCodeAlpha2, true);
          Alert.alert('🎉 Marcado!', `${country.name} foi adicionado aos países visitados!`);
        }
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível atualizar o país');
    }
  };

  const toggleWishlist = async () => {
    if (!country) return;
    if (isWishlisted) {
      await removeFromWishlist(country.code);
      setIsWishlisted(false);
      onWishlistChange?.(country.code, false);
    } else {
      await addToWishlist(country.code, country.name);
      setIsWishlisted(true);
      onWishlistChange?.(country.code, true);
    }
  };

  return (
    <>
      <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={handleClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {loading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.modalLoadingText}>Carregando informações...</Text>
              </View>
            ) : details ? (
              <>
                {/* Header escuro */}
                <View style={styles.modalHeader}>
                  <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                    <Ionicons name="close" size={18} color="white" />
                  </TouchableOpacity>

                  <CountryFlag
                    countryCode={country?.code}
                    width={72}
                    height={48}
                    borderRadius={8}
                    style={styles.modalFlag}
                  />

                  <Text style={styles.modalCountryName}>{details.name}</Text>
                  <Text style={styles.modalCountrySub}>
                    {details.region} · {details.subregion}
                  </Text>

                  <View style={styles.statsRow}>
                    <View style={styles.statPill}>
                      <Text style={styles.statValue}>{photoStats.photoCount}</Text>
                      <Text style={styles.statLabel}>fotos</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statValue}>{photoStats.cityCount}</Text>
                      <Text style={styles.statLabel}>cidades</Text>
                    </View>
                    <View style={styles.statPill}>
                      <Text style={styles.statValue}>{photoStats.favoriteCount}</Text>
                      <Text style={styles.statLabel}>favoritas</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.visitedBtn} onPress={toggleVisited}>
                    <Ionicons
                      name={isVisited ? 'checkmark-circle' : 'add-circle-outline'}
                      size={16}
                      color={isVisited ? '#4ade80' : 'rgba(255,255,255,0.6)'}
                    />
                    <Text
                      style={[
                        styles.visitedBtnText,
                        { color: isVisited ? '#4ade80' : 'rgba(255,255,255,0.6)' },
                      ]}
                    >
                      {isVisited ? 'Já visitei ✓' : 'Marcar como visitado'}
                    </Text>
                  </TouchableOpacity>

                  {!isVisited && (
                    <TouchableOpacity
                      onPress={toggleWishlist}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        marginTop: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderRadius: 12,
                        backgroundColor: '#1b1f3a',
                        borderWidth: 1.5,
                        borderColor: isWishlisted ? '#FFFFFF' : '#6C2BD9',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>🗺️</Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: isWishlisted ? '#FFFFFF' : '#6C2BD9',
                          letterSpacing: 0.5,
                        }}
                      >
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
                    <Ionicons
                      name={showCountryInfo ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#666"
                    />
                  </TouchableOpacity>

                  {showCountryInfo && (
                    <View style={styles.accordionBody}>
                      <View style={styles.infoGrid}>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Capital</Text>
                          <Text style={styles.infoValue}>{details.capital || '-'}</Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>População</Text>
                          <Text style={styles.infoValue}>
                            {details.population
                              ? (details.population / 1000000).toFixed(1) + 'M'
                              : '-'}
                          </Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Idioma</Text>
                          <Text style={styles.infoValue} numberOfLines={1}>
                            {details.languages?.[0] || '-'}
                          </Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Moeda</Text>
                          <Text style={styles.infoValue} numberOfLines={1}>
                            {details.currencies?.[0]
                              ? `${details.currencies[0].symbol || ''} ${details.currencies[0].name}`
                              : '-'}
                          </Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Código</Text>
                          <Text style={styles.infoValue}>{details.phoneCode || '-'}</Text>
                        </View>
                        <View style={styles.infoItem}>
                          <Text style={styles.infoLabel}>Área</Text>
                          <Text style={styles.infoValue}>
                            {details.area ? (details.area / 1000000).toFixed(1) + 'M km²' : '-'}
                          </Text>
                        </View>
                      </View>

                      {details.cultural?.foods?.length > 0 && (
                        <View style={styles.infoSection}>
                          <Text style={styles.infoSectionTitle}>🍕 Comidas típicas</Text>
                          <View style={styles.tagsRow}>
                            {details.cultural.foods.map((item, i) => (
                              <View key={i} style={styles.tag}>
                                <Text style={styles.tagText}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {details.cultural?.attractions?.length > 0 && (
                        <View style={styles.infoSection}>
                          <Text style={styles.infoSectionTitle}>🗺️ Pontos turísticos</Text>
                          <View style={styles.tagsRow}>
                            {details.cultural.attractions.map((item, i) => (
                              <View key={i} style={[styles.tag, styles.tagOrange]}>
                                <Text style={[styles.tagText, { color: '#6C2BD9' }]}>{item}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {borderCountries.length > 0 && (
                        <View style={styles.infoSection}>
                          <Text style={styles.infoSectionTitle}>
                            🌍 Países vizinhos ({borderCountries.length})
                          </Text>
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

                  <View style={styles.requirementsSection}>
                    <CountryRequirementsCard countryCode={country?.code} light />
                  </View>

                  {/* Top Lugares por cidade */}
                  {Object.keys(topPlaces).length > 0 && (
                    <View style={{ marginHorizontal: 12, marginTop: 10 }}>
                      {Object.entries(topPlaces).map(([city, places]) => (
                        <View key={city} style={styles.topPlacesCard}>
                          <Text style={styles.topPlacesTitle}>🏆 Top lugares em {city}</Text>
                          {places.map((place, i) => (
                            <View key={place.name} style={styles.topPlaceRow}>
                              <Text style={styles.topPlaceRank}>{i + 1}º</Text>
                              <Text style={styles.topPlaceName} numberOfLines={1}>
                                {place.name}
                              </Text>
                              <View style={styles.topPlaceRatingBox}>
                                <Ionicons name="star" size={11} color="#FFD700" />
                                <Text style={styles.topPlaceRating}>
                                  {place.avgRating.toFixed(1)}
                                </Text>
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
                      countryCode={country.code}
                      countryName={country.name}
                      userId={user?.id}
                      coverPhotoId={coverPhotoId}
                      scrollToCity={scrollToCity}
                      onScrollToCityDone={onScrollToCityDone}
                      onStatsUpdate={(stats) => setPhotoStats(stats)}
                      onCoverPhotoSet={(newPhotoId, newPhotoUrl) =>
                        onCoverPhotoSet?.(newPhotoId, newPhotoUrl)
                      }
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              paddingTop: 20,
              borderBottomWidth: 0.5,
              borderBottomColor: '#f0f0f0',
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: '600', color: '#0D1326' }}>Adicionar foto</Text>
            <TouchableOpacity onPress={() => setShowUploader(false)}>
              <Ionicons name="close" size={24} color="#0D1326" />
            </TouchableOpacity>
          </View>
          <ScrollView>
            <View style={{ padding: 16 }}>
              <PhotoUploader
                countryCode={country?.code}
                countryName={country?.name}
                countryNameEn={details?.name || country?.name}
                userId={user?.id}
                onPhotoUploaded={() => {
                  setShowUploader(false);
                  onPhotoUploaded?.();
                }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// Estilos vindos do mapa anterior sem alteração — o modal tem de ficar idêntico
// nos dois mapas.
const styles = StyleSheet.create({
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
  modalLoading: {
    padding: 60,
    alignItems: 'center',
  },
  modalLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.gray,
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
  requirementsSection: {
    marginHorizontal: 12,
    marginTop: 10,
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
  photosSection: {
    backgroundColor: 'white',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 14,
    minHeight: 200,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
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
});
