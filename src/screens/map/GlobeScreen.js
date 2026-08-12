// Mapa principal do app: globo 3D (MapLibre GL + Stadia Maps).
//
// Substituiu o mapa Leaflet ao fim da migração. Tem projeção globe, satélite,
// rótulos em português, atmosfera, fundo estrelado, badges progressivos por
// zoom, território pintado por status, clique em país abrindo o modal, barra de
// IA, busca de país e a estatística de países visitados.
//
// O MapLibre GL desenha em WebGL sobre canvas do browser, então no iOS/Android
// esta tela cai numa lista de países — a mesma que o mapa Leaflet usava no
// nativo, pelo mesmo motivo.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlobeMap from '../../components/map/GlobeMap';
import CountryBadgeMarkers from '../../components/map/CountryBadgeMarkers';
import CountryFillLayer from '../../components/map/CountryFillLayer';
import CountryDetailModal from '../../components/map/CountryDetailModal';
import CountryFlag from '../../components/CountryFlag';
import useGlobeCountries from '../../components/map/useGlobeCountries';
import {
  searchCountries,
  COUNTRY_SEARCH_DEBOUNCE_MS,
  MIN_COUNTRY_QUERY_LENGTH,
} from '../../utils/geoSearch';

// 195 países soberanos + Inglaterra, Escócia, País de Gales e Irlanda do Norte
// como entradas independentes. O mapa tem âncora para ~240 territórios, mas o
// denominador da estatística continua sendo este — mudar aqui faria a
// porcentagem discordar do resto do app (conquistas, passaporte).
const TOTAL_COUNTRIES = 199;

// Para onde a câmera vai quando a busca escolhe um país: perto o bastante para o
// país ocupar a tela, e já dentro do nível em que todo vizinho ganha badge.
const SEARCH_FLY_ZOOM = 4;

export default function GlobeScreen({ navigation }) {
  const [map, setMap] = useState(null);
  const {
    countries,
    geoData,
    visited,
    wishlist,
    user,
    applyVisitedChange,
    applyWishlistChange,
    loading,
    error,
  } = useGlobeCountries();

  const [selectedCountry, setSelectedCountry] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [debouncedCountrySearch, setDebouncedCountrySearch] = useState('');
  const [showCountrySearch, setShowCountrySearch] = useState(false);

  const handleMapReady = useCallback((instance) => setMap(instance), []);

  const visitedCount = visited.size;
  const wishlistCount = wishlist.size;
  const visitedPercentage = (visitedCount / TOTAL_COUNTRIES) * 100;
  const remainingCount = Math.max(TOTAL_COUNTRIES - visitedCount, 0);

  // Índice por código: o clique no território devolve só o alpha-3, e o modal
  // precisa do nome em português.
  const byCode = useMemo(() => {
    const index = new Map();
    for (const country of countries) index.set(country.code, country);
    return index;
  }, [countries]);

  // Debounce compartilhado com as outras buscas do app (geoSearch).
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCountrySearch(countrySearch);
    }, COUNTRY_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [countrySearch]);

  const searchResults = useMemo(
    () => searchCountries(countries, debouncedCountrySearch),
    [countries, debouncedCountrySearch]
  );

  const openCountry = useCallback((country) => {
    if (!country?.code) return;
    setSelectedCountry({ code: country.code, name: country.name });
    setModalVisible(true);
  }, []);

  // Clique no território pintado (fill layer) — chega só com o código.
  const handleSelectByCode = useCallback(
    (alpha3) => {
      const country = byCode.get(alpha3);
      if (country) openCountry(country);
    },
    [byCode, openCountry]
  );

  const closeCountrySearch = useCallback(() => {
    setShowCountrySearch(false);
    setCountrySearch('');
    setDebouncedCountrySearch('');
  }, []);

  // Busca: o globo voa até o país e o modal abre — as duas coisas. O mapa
  // anterior só abria o modal, porque lá não havia câmera para mover.
  const handleSelectSearchResult = useCallback(
    (country) => {
      closeCountrySearch();
      map?.flyTo({ center: [country.lng, country.lat], zoom: SEARCH_FLY_ZOOM, duration: 1800 });
      openCountry(country);
    },
    [closeCountrySearch, map, openCountry]
  );

  const isSelectedVisited = selectedCountry ? visited.has(selectedCountry.code) : false;

  // O globo é WebGL sobre canvas: no nativo não há o que renderizar. A lista
  // ordenada é o mesmo fallback que o mapa anterior usava — mesma navegação para
  // o modal, mesmo destaque de visitado.
  const isWeb = process.env.EXPO_OS === 'web';

  return (
    <View style={styles.container}>
      {isWeb ? (
        <View style={styles.mapWrapper}>
          <GlobeMap onMapReady={handleMapReady} />
          <CountryFillLayer
            map={map}
            geoData={geoData}
            visited={visited}
            wishlist={wishlist}
            onSelectCountry={handleSelectByCode}
          />
          <CountryBadgeMarkers map={map} countries={countries} onSelect={openCountry} />
        </View>
      ) : (
        <View style={styles.nativeList}>
          <View style={styles.nativeHeader}>
            <Text style={styles.nativeTitle}>Explore os países</Text>
            <Text style={styles.nativeSubtitle}>
              Selecione um destino para ver detalhes e registrar sua viagem.
            </Text>
          </View>
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.nativeListContent}
          >
            {[...countries]
              .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
              .map((country) => {
                const countryVisited = visited.has(country.code);
                return (
                  <TouchableOpacity
                    key={country.code}
                    onPress={() => openCountry(country)}
                    activeOpacity={0.75}
                    style={[styles.nativeRow, countryVisited && styles.nativeRowVisited]}
                  >
                    <CountryFlag
                      countryCode={country.code}
                      width={28}
                      height={19}
                      borderRadius={3}
                    />
                    <Text style={styles.nativeRowText}>{country.name}</Text>
                    {countryVisited && (
                      <Ionicons name="checkmark-circle" size={20} color="#00D1C1" />
                    )}
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>
      )}

      {/* Barra do assistente de viagem + busca de país */}
      <View style={styles.topBarRow}>
        {!showCountrySearch ? (
          <>
            <TouchableOpacity
              onPress={() => navigation.navigate('TripPlanner')}
              style={styles.assistantBar}
            >
              <Ionicons name="sparkles-outline" size={18} color="#6C2BD9" />
              <Text style={styles.assistantText}>✈️ Planejar viagem com IA...</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowCountrySearch(true)}
              style={styles.iconBtn}
              accessibilityLabel="Pesquisar país"
            >
              <Ionicons name="search" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </>
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
              <TextInput
                autoFocus
                value={countrySearch}
                onChangeText={setCountrySearch}
                placeholder="Pesquisar país..."
                placeholderTextColor="#555a78"
                style={styles.searchInput}
              />
              <TouchableOpacity onPress={closeCountrySearch} accessibilityLabel="Fechar busca">
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {debouncedCountrySearch.trim().length >= MIN_COUNTRY_QUERY_LENGTH && (
              <View style={styles.searchDropdown}>
                {searchResults.length > 0 ? (
                  searchResults.map((country, idx) => (
                    <TouchableOpacity
                      key={country.code}
                      onPress={() => handleSelectSearchResult(country)}
                      style={[styles.searchResultItem, idx > 0 && styles.searchResultBorder]}
                    >
                      <CountryFlag
                        countryCode={country.code}
                        width={24}
                        height={16}
                        borderRadius={3}
                      />
                      <Text style={styles.searchResultText}>{country.name}</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.searchResultItem}>
                    <Text style={styles.searchResultText}>Nenhum país encontrado</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Estatísticas de países visitados.
          Mesmos dados e mesma conta do mapa anterior; mudou a forma. O card
          branco com anel SVG era desenhado para um mapa claro — sobre o satélite
          e o espaço ele vira um retângulo aceso no meio da cena. Aqui virou uma
          barra de vidro escuro, que é o material do resto da interface do globo. */}
      <View style={styles.statsCard}>
        <View style={styles.statsHeader}>
          <Text style={styles.statsPercentage}>{visitedPercentage.toFixed(1)}%</Text>
          <Text style={styles.statsCaption}>do mundo</Text>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(visitedPercentage, 100)}%` }]} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#6C2BD9' }]} />
            <Text style={styles.statText}>{visitedCount} visitados</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: '#FFFFFF' }]} />
            <Text style={styles.statText}>{wishlistCount} na wishlist</Text>
          </View>
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
            <Text style={styles.statText}>{remainingCount} restantes</Text>
          </View>
        </View>
      </View>

      {(loading || error) && (
        <View style={styles.notice}>
          <Text style={error ? styles.error : styles.statText}>
            {error || 'Carregando países…'}
          </Text>
        </View>
      )}

      <CountryDetailModal
        visible={modalVisible}
        country={selectedCountry}
        user={user}
        isVisited={isSelectedVisited}
        coverPhotoId={null}
        onClose={() => setModalVisible(false)}
        onVisitedChange={applyVisitedChange}
        onWishlistChange={applyWishlistChange}
      />
    </View>
  );
}

const glass = {
  backgroundColor: 'rgba(13,19,38,0.92)',
  borderWidth: 1,
  borderColor: 'rgba(108,43,217,0.4)',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05070F' },
  mapWrapper: { flex: 1 },
  topBarRow: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 1001,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...glass,
  },
  assistantBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...glass,
  },
  assistantText: { color: '#9aa0c6', fontSize: 14, flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...glass,
  },
  searchInput: {
    flex: 1,
    color: 'white',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
  },
  searchDropdown: {
    backgroundColor: 'rgba(13,19,38,0.96)',
    borderRadius: 12,
    marginTop: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(108,43,217,0.3)',
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
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  statsCard: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    width: 230,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    ...glass,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statsPercentage: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statsCaption: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#6C2BD9',
  },
  statsRow: { gap: 4 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  nativeList: { flex: 1, backgroundColor: '#0D1326', paddingTop: 76 },
  nativeHeader: { paddingHorizontal: 16, paddingBottom: 10, gap: 4 },
  nativeTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  nativeSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  nativeListContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 8 },
  nativeRow: {
    minHeight: 52,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  nativeRowVisited: {
    backgroundColor: 'rgba(108,43,217,0.28)',
    borderColor: '#6C2BD9',
  },
  nativeRowText: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  notice: {
    position: 'absolute',
    top: 76,
    left: 16,
    borderRadius: 14,
    padding: 12,
    ...glass,
  },
  error: {
    color: '#FF4D6D',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
});
