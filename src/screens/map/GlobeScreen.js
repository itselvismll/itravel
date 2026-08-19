// Mapa principal do app: globo 3D (MapLibre GL + Stadia Alidade Satellite).
//
// Substituiu o mapa Leaflet ao fim da migração. Tem projeção globe, satélite,
// rótulos em português, atmosfera, fundo estrelado, badges progressivos por
// zoom, território pintado por status, clique em país abrindo o modal, barra de
// IA, busca de país e a estatística de países visitados.
//
// No navegador o MapLibre GL desenha diretamente no canvas. No iOS/Android o
// mesmo componente WebGL roda dentro de um DOM Component do Expo, preservando a
// projeção esférica e mantendo busca/modal/tab bar como controles nativos.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlobeMap from '../../components/map/GlobeMap';
import NativeGlobe from '../../components/map/NativeGlobe.dom';
import CountryBadgeMarkers from '../../components/map/CountryBadgeMarkers';
import CountryFillLayer from '../../components/map/CountryFillLayer';
import CountryDetailModal from '../../components/map/CountryDetailModal';
import CountryFlag from '../../components/CountryFlag';
import GuidedFirstCountryCard from '../../components/onboarding/GuidedFirstCountryCard';
import FirstCountryCelebration from '../../components/onboarding/FirstCountryCelebration';
import { useOnboarding } from '../../context/OnboardingContext';
import { TAB_BAR_CLEARANCE } from '../../utils/tabBarLayout';
import useGlobeCountries from '../../components/map/useGlobeCountries';
import {
  searchCountries,
  COUNTRY_SEARCH_DEBOUNCE_MS,
  MIN_COUNTRY_QUERY_LENGTH,
} from '../../utils/geoSearch';

// Denominador de partida do pill, usado só enquanto o GeoJSON não chegou. Assim
// que `countries` carrega, o total passa a ser o tamanho real da lista — é o
// mesmo universo de países que o globo desenha, então o "x de y" fecha com o que
// está na tela. 199 = 195 soberanos + as 4 nações do Reino Unido, que é o
// denominador usado no resto do app (conquistas, passaporte).
const TOTAL_COUNTRIES = 199;

// Para onde a câmera vai quando a busca escolhe um país: perto o bastante para o
// país ocupar a tela, e já dentro do nível em que todo vizinho ganha badge.
const SEARCH_FLY_ZOOM = 4;

export default function GlobeScreen({ navigation }) {
  const [map, setMap] = useState(null);
  // Dentro das bottom tabs o inset de baixo já é consumido pela própria tab bar
  // (o react-navigation zera o bottom no contexto da tela), então isto some
  // quando a tab bar está presente e volta a valer se a tela for aberta sem ela.
  const insets = useSafeAreaInsets();
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
  const [nativeFocusCountry, setNativeFocusCountry] = useState(null);
  const [nativeMapError, setNativeMapError] = useState(null);

  const handleMapReady = useCallback((instance) => setMap(instance), []);

  const visitedCount = visited.size;
  const totalCountries = countries.length || TOTAL_COUNTRIES;

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

  // ── Ação guiada do onboarding ────────────────────────────────────────────
  // Só conta nova que acabou de passar pelos slides chega aqui com
  // `guidedActive`; para todo mundo o hook devolve o estado inerte.
  const { guidedActive, finishOnboarding } = useOnboarding();
  const [celebration, setCelebration] = useState(null);

  // Fechamento LOCAL do card, separado do `guidedActive`.
  //
  // O `finishOnboarding` é assíncrono e o `guidedActive` só cai quando o estado
  // do fluxo dá a volta pelo contexto. Prender o sumiço do card a essa volta
  // deixaria ele na tela durante a celebração se qualquer coisa nesse caminho
  // falhasse ou atrasasse. Aqui o card sai no mesmo tique em que o país é
  // marcado — que é o que o usuário vê como "funcionou".
  const [guidedDismissed, setGuidedDismissed] = useState(false);
  const showGuidedCard = guidedActive && !guidedDismissed;

  const dismissGuided = useCallback(() => {
    setGuidedDismissed(true);
    finishOnboarding();
  }, [finishOnboarding]);

  // A marcação em si é a que já existe (CountryDetailModal → applyVisitedChange).
  // Este wrapper só escuta o resultado: quando o primeiro país entra durante a
  // etapa guiada, ele celebra e encerra o onboarding.
  const handleVisitedChange = useCallback(
    (code, isVisited) => {
      applyVisitedChange(code, isVisited);
      if (!guidedActive || !isVisited) return;

      const marked = selectedCountry ? byCode.get(selectedCountry.code) : null;

      // O card guiado sai de cena aqui: marcar o país É o objetivo dele, então
      // ele não pode continuar pedindo o que acabou de ser feito.
      setGuidedDismissed(true);

      // O modal cobre a tela: sem fechá-lo, a celebração e o território acendendo
      // em roxo aconteceriam atrás dele, sem ninguém ver.
      setModalVisible(false);
      setCelebration({ name: marked?.name || selectedCountry?.name || null });

      // O globo leva a câmera até o país recém-marcado: a celebração perde a
      // graça se o território que acabou de acender estiver fora da tela.
      if (marked?.lat != null && marked?.lng != null) {
        map?.flyTo({ center: [marked.lng, marked.lat], zoom: 2.6, duration: 1400 });
      }

      // Este é o ponto que encerra o onboarding no Supabase.
      finishOnboarding();
    },
    [applyVisitedChange, guidedActive, selectedCountry, byCode, map, finishOnboarding]
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
      setNativeFocusCountry((previous) => ({
        center: [country.lng, country.lat],
        requestId: (previous?.requestId ?? 0) + 1,
      }));
      openCountry(country);
    },
    [closeCountrySearch, map, openCountry]
  );

  const isSelectedVisited = selectedCountry ? visited.has(selectedCountry.code) : false;

  const handleNativeCountrySelect = useCallback(
    async (country) => {
      openCountry(country);
    },
    [openCountry]
  );

  const handleNativeMapFailure = useCallback(async (message) => {
    setNativeMapError(message || 'Não foi possível carregar o globo');
  }, []);

  // No web o mapa entrega a instância diretamente para as camadas React. No
  // nativo, NativeGlobe reconstrói essas camadas em sua WebView e conversa com
  // esta tela por props serializáveis e ações assíncronas.
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
        <View style={styles.mapWrapper}>
          <NativeGlobe
            countries={countries}
            visitedCodes={[...visited]}
            wishlistCodes={[...wishlist]}
            focusCountry={nativeFocusCountry}
            onSelectCountry={handleNativeCountrySelect}
            onMapFailure={handleNativeMapFailure}
            dom={{
              scrollEnabled: false,
              contentInsetAdjustmentBehavior: 'never',
              style: styles.nativeGlobe,
            }}
          />
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

      {/* Países visitados — pill no canto inferior direito.
          Mora fora do fluxo do globo e ACIMA da tab bar. A barra é absoluta e
          não reserva espaço nenhum no layout, então sem somar TAB_BAR_CLEARANCE
          o pill nasce atrás dela. O inset entra por fora, para o aparelho com
          barra de gestos.
          O contador é o número real de visitados sobre o total de países que o
          globo desenha. */}
      <View
        style={[styles.visitedPill, { bottom: TAB_BAR_CLEARANCE + insets.bottom }]}
        accessibilityRole="text"
        accessibilityLabel={`${visitedCount} de ${totalCountries} países visitados`}
      >
        <Ionicons name="location" size={14} color="#6C2BD9" />
        <Text style={styles.visitedCount}>{visitedCount}</Text>
        <Text style={styles.visitedTotal}>de {totalCountries} países</Text>
      </View>

      {(loading || error || nativeMapError) && (
        <View style={styles.notice}>
          <Text style={error || nativeMapError ? styles.error : styles.statText}>
            {error || nativeMapError || 'Carregando países…'}
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
        onVisitedChange={handleVisitedChange}
        onWishlistChange={applyWishlistChange}
        suppressVisitedAlert={guidedActive}
      />

      {/* Ação guiada do onboarding. O card fica ACIMA do pill de países
          visitados, e é sobreposição — o globo continua girando, dando zoom e
          respondendo ao clique por trás dele. */}
      {showGuidedCard && (
        <GuidedFirstCountryCard
          bottom={TAB_BAR_CLEARANCE + insets.bottom + 52}
          onSkip={dismissGuided}
        />
      )}

      {celebration && (
        <FirstCountryCelebration
          countryName={celebration.name}
          onDone={() => setCelebration(null)}
        />
      )}
    </View>
  );
}

// backdrop-filter é CSS: só existe no web, e no nativo a chave seria ignorada
// (com aviso do RN). Fora do web o pill fica no fundo sólido translúcido.
const blur =
  process.env.EXPO_OS === 'web'
    ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }
    : null;

const glass = {
  backgroundColor: 'rgba(13,19,38,0.92)',
  borderWidth: 1,
  borderColor: 'rgba(108,43,217,0.4)',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05070F' },
  mapWrapper: { flex: 1 },
  nativeGlobe: { flex: 1, backgroundColor: '#05070F' },
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
  visitedPill: {
    position: 'absolute',
    right: 16,
    // `bottom` vem do componente (16 + safe area inset).
    zIndex: 1001,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(13,19,38,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(108,43,217,0.4)',
    ...blur,
  },
  visitedCount: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    fontWeight: '700',
  },
  visitedTotal: {
    color: '#7A7E8C',
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  statText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
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
