// Mapa principal do app: globo 3D (MapLibre GL, vetorial da Stadia Alidade
// Satellite com a imagem de satélite do Mapbox).
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
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlobeMap from '../../components/map/GlobeMap';
import NativeGlobe from '../../components/map/NativeGlobe.dom';
import CountryBadgeMarkers from '../../components/map/CountryBadgeMarkers';
import CountryFillLayer from '../../components/map/CountryFillLayer';
import PlanRouteLayer from '../../components/map/PlanRouteLayer';
import PlanDayTabs from '../../components/map/PlanDayTabs';
import NearbyPlacesSheet from '../../components/map/NearbyPlacesSheet';
import useNearbyPlaces from '../../hooks/useNearbyPlaces';
import { badgeCountries, planPointCountries } from '../../components/map/planBadges';
import { buildDayInfo } from '../../components/map/planDayStrip';
import CountryDetailModal from '../../components/map/CountryDetailModal';
import CountryFlag from '../../components/CountryFlag';
import { getCountryNamePtByCode } from '../../utils/countryUtils';
import GuidedFirstCountryCard from '../../components/onboarding/GuidedFirstCountryCard';
import FirstCountryCelebration from '../../components/onboarding/FirstCountryCelebration';
import { useOnboarding } from '../../context/OnboardingContext';
import { useActivePlan } from '../../context/ActivePlanContext';
import { TAB_BAR_CLEARANCE } from '../../utils/tabBarLayout';
import useGlobeCountries from '../../components/map/useGlobeCountries';
import {
  searchCountries,
  COUNTRY_SEARCH_DEBOUNCE_MS,
  MIN_COUNTRY_QUERY_LENGTH,
} from '../../utils/geoSearch';
import { planDays } from '../../components/map/planRoute';
import { walkingDirectionsUrl } from '../../utils/mapsLink';

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
  const isFocused = useIsFocused();
  const [map, setMap] = useState(null);
  // Dentro das bottom tabs o inset de baixo já é consumido pela própria tab bar
  // (o react-navigation zera o bottom no contexto da tela), então isto some
  // quando a tab bar está presente e volta a valer se a tela for aberta sem ela.
  const insets = useSafeAreaInsets();

  // No web o mapa entrega a instância diretamente para as camadas React. No
  // nativo, NativeGlobe reconstrói essas camadas em sua WebView e conversa com
  // esta tela por props serializáveis e ações assíncronas.
  const isWeb = process.env.EXPO_OS === 'web';

  // A geometria só é carregada aqui no web. No nativo quem faz isso é a WebView
  // do NativeGlobe, que devolve a lista pronta por `onCountriesResolved` — ver o
  // cabeçalho de useGlobeCountries.
  const {
    countries,
    geoData,
    visited,
    wishlist,
    user,
    applyVisitedChange,
    applyWishlistChange,
    adoptCountryAnchors,
    loading,
    error,
  } = useGlobeCountries({ loadGeometry: isWeb });

  const [selectedCountry, setSelectedCountry] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [debouncedCountrySearch, setDebouncedCountrySearch] = useState('');
  const [showCountrySearch, setShowCountrySearch] = useState(false);
  const [nativeFocusCountry, setNativeFocusCountry] = useState(null);
  const [nativeMapError, setNativeMapError] = useState(null);

  const handleMapReady = useCallback((instance) => setMap(instance), []);

  // Roteiro aplicado no globo. Sem nenhum ativo, `points` é vazio e a camada não
  // cria layer nenhuma — o globo fica só com países visitados e wishlist. O
  // controle de aplicar/remover mora na tela de roteiros salvos, não aqui: o
  // globo não ganha botão nem card sobreposto.
  const { points: planPoints, activePlanId, activePlan } = useActivePlan();

  // Dia em foco no roteiro; `null` mostra a viagem inteira, que é como ela abre.
  const [selectedDay, setSelectedDay] = useState(null);
  const planDayList = useMemo(() => planDays(planPoints), [planPoints]);

  // ── A parada aberta, e o grupo aberto ────────────────────────────────────
  // Este estado mora AQUI, e não dentro da camada do mapa, porque ele é o mesmo
  // nas duas plataformas: na web o mapa é um canvas ao lado; no iOS/Android é
  // uma WebView. Em ambos, quem desenha a folha é o React Native, e o mapa só
  // avisa o que foi tocado. Foi o que permitiu o roteiro chegar ao nativo sem
  // reescrever nada da lógica.
  const [selectedStop, setSelectedStop] = useState(null);
  const [clusterGroup, setClusterGroup] = useState(null);

  // O lugar da lista que está aceso no mapa, e a altura que a folha ocupa.
  //
  // A altura é medida pela própria folha e desce até a camada do mapa: é ela que
  // diz quanto da tela está coberto, e sem ela a área a pé — desenhada em volta
  // da parada, no meio do mapa — nasceria atrás da lista que acabou de abrir.
  const [focusedPlace, setFocusedPlace] = useState(null);
  const [sheetHeight, setSheetHeight] = useState(0);

  // A área a pé e os lugares dentro dela. O hook é React puro — sem mapa, sem
  // DOM — e a área que ele devolve volta para a camada como prop, pronta para
  // desenhar.
  const nearby = useNearbyPlaces(selectedStop);

  const handleSelectStop = useCallback((properties) => {
    if (!properties) return;
    setClusterGroup(null);
    // O destaque pertence à parada anterior: a lista inteira vai ser outra.
    setFocusedPlace(null);
    setSelectedStop(properties);
  }, []);

  // Toque na LINHA da lista: acende o lugar no mapa e leva a câmera até ele.
  // Tocar de novo apaga — é o mesmo gesto, e sem isso não haveria como desfazer
  // o destaque sem fechar a folha.
  const handleFocusPlace = useCallback((place) => {
    setFocusedPlace((current) => (current?.id === place?.id ? null : place));
  }, []);

  // Toque no ícone de rota: sai do Journi para o app de mapas do aparelho, com o
  // trajeto a pé já montado. É uma ação deliberada, num alvo próprio — por isso
  // ela não mora no toque da linha.
  const handleNavigatePlace = useCallback(async (place) => {
    const url = walkingDirectionsUrl(place, Platform.OS);
    if (!url) return;

    // Sem `catch` a promessa rejeitada de um aparelho sem app de mapas viraria
    // um unhandled rejection — e um app de mapas ausente não é motivo para
    // barulho: quem tocou volta para a folha, que continua na tela.
    try {
      await Linking.openURL(url);
    } catch {
      /* segue como estava */
    }
  }, []);

  const handleSelectCluster = useCallback((members) => {
    if (!members?.length) return;
    setSelectedStop(null);
    setClusterGroup({ count: members.length, members });
  }, []);

  const handleDismissPlanSelection = useCallback(() => {
    setSelectedStop(null);
    setClusterGroup(null);
    setFocusedPlace(null);
  }, []);

  // Trocar de roteiro ou de dia fecha a folha: ela pertence a uma parada
  // específica, e essa parada pode nem estar mais na tela.
  useEffect(() => {
    handleDismissPlanSelection();
  }, [activePlanId, selectedDay, handleDismissPlanSelection]);

  // Em que país cai cada parada. Calculado onde a geometria existe — aqui, no
  // web; dentro do DOM Component, no nativo — e entregue à camada, que carimba o
  // código na feature. É de lá que a bandeira do cabeçalho da folha sai.
  const planCountryCodes = useMemo(
    () => planPointCountries(planPoints, geoData),
    [planPoints, geoData]
  );

  // Data e lugar de cada dia, que é o que a faixa do seletor escreve nas
  // pílulas e na legenda. O país entra como reserva do lugar: nem toda parada
  // traz `location`, mas a geometria sempre sabe em que país ela caiu.
  const planDayInfo = useMemo(
    () => buildDayInfo(
      planPoints,
      activePlan?.plan_data,
      planCountryCodes.map((code) => (code ? getCountryNamePtByCode(code, '') : ''))
    ),
    [planPoints, activePlan, planCountryCodes]
  );

  // Com roteiro aplicado, só os países por onde ele passa mantêm bandeira no
  // globo: os pinos numerados e o traçado do dia já disputam a mesma região da
  // tela, e a bandeira de cada vizinho era a terceira camada nessa disputa.
  const visibleBadgeCountries = useMemo(
    () => badgeCountries(countries, planCountryCodes, planPoints.length > 0),
    [countries, planCountryCodes, planPoints.length]
  );

  // Trocar de roteiro volta para "Todos": o dia 3 do roteiro anterior não quer
  // dizer nada no novo, e pior — se o novo tiver dois dias, o filtro esconderia
  // o roteiro inteiro e o globo pareceria vazio.
  useEffect(() => {
    setSelectedDay(null);
  }, [activePlanId]);

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

  // As três ações do roteiro que atravessam a ponte do DOM Component. São
  // `async` porque toda função passada a um DOM Component é assíncrona por
  // natureza — a chamada vira mensagem e não tem como devolver valor na hora.
  // Fora isso, elas são os MESMOS handlers que a web chama direto.
  const handleNativeSelectStop = useCallback(
    async (properties) => {
      handleSelectStop(properties);
    },
    [handleSelectStop]
  );

  const handleNativeSelectCluster = useCallback(
    async (members) => {
      handleSelectCluster(members);
    },
    [handleSelectCluster]
  );

  const handleNativeDismiss = useCallback(async () => {
    handleDismissPlanSelection();
  }, [handleDismissPlanSelection]);

  const handleNativeMapFailure = useCallback(async (message) => {
    setNativeMapError(message || 'Não foi possível carregar o globo');
  }, []);

  // A lista de países calculada dentro da WebView. Chega uma vez por sessão e
  // alimenta a busca e o "x de y" — o mesmo papel que, no web, as âncoras
  // calculadas pelo próprio hook cumprem.
  const handleNativeCountriesResolved = useCallback(
    async (list) => {
      adoptCountryAnchors(list);
    },
    [adoptCountryAnchors]
  );

  // Props do NativeGlobe: referências estáveis, porque TUDO que é passado para um
  // DOM Component atravessa a ponte serializado a cada render do pai. Um
  // `[...visited]` escrito no JSX seria um array novo — e uma serialização nova —
  // a cada tecla digitada na busca ou a cada abertura de modal.
  const visitedCodes = useMemo(() => [...visited], [visited]);
  const wishlistCodes = useMemo(() => [...wishlist], [wishlist]);

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
          <PlanRouteLayer
            map={map}
            points={planPoints}
            planId={activePlanId}
            selectedDay={selectedDay}
            countryCodes={planCountryCodes}
            nearbyArea={nearby.area}
            focusPlace={focusedPlace}
            bottomInset={sheetHeight}
            onSelectStop={handleSelectStop}
            onSelectCluster={handleSelectCluster}
            onDismiss={handleDismissPlanSelection}
          />
          <CountryBadgeMarkers
            map={map}
            countries={visibleBadgeCountries}
            onSelect={openCountry}
          />
        </View>
      ) : isFocused ? (
        <View style={styles.mapWrapper}>
          <NativeGlobe
            visitedCodes={visitedCodes}
            wishlistCodes={wishlistCodes}
            focusCountry={nativeFocusCountry}
            planPoints={planPoints}
            planId={activePlanId}
            selectedDay={selectedDay}
            nearbyArea={nearby.area}
            focusPlace={focusedPlace}
            bottomInset={sheetHeight}
            onSelectCountry={handleNativeCountrySelect}
            onSelectPlanStop={handleNativeSelectStop}
            onSelectPlanCluster={handleNativeSelectCluster}
            onDismissPlanSelection={handleNativeDismiss}
            onCountriesResolved={handleNativeCountriesResolved}
            onMapFailure={handleNativeMapFailure}
            dom={{
              scrollEnabled: false,
              contentInsetAdjustmentBehavior: 'never',
              style: styles.nativeGlobe,
            }}
          />
        </View>
      ) : (
        <View style={styles.mapWrapper} />
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
              <Text style={styles.assistantText}>Planejar viagem com IA...</Text>
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

      {/* Seletor de dia: no TOPO, logo abaixo da barra de IA, e nas duas
          plataformas. Ele deixou o rodapé porque lá disputava o canto com o
          contador de países — e deixou de ser web-only porque o roteiro agora é
          desenhado também no globo nativo. */}
      {/* Some enquanto a busca está aberta: os resultados descem exatamente por
          aqui, e duas superfícies no mesmo lugar deixariam os chips por cima da
          lista de países. */}
      {!showCountrySearch && (
        <PlanDayTabs
          days={planDayList}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
          dayInfo={planDayInfo}
          style={{ top: PLAN_TABS_TOP }}
        />
      )}

      {/* Contador de países: texto, não mais um pill.
          Ele mora fora do fluxo do globo e ACIMA da tab bar — a barra é absoluta
          e não reserva espaço nenhum no layout, então sem somar
          TAB_BAR_CLEARANCE o texto nasce atrás dela. O inset entra por fora,
          para o aparelho com barra de gestos.
          Virou texto porque um pill com borda e fundo dava a ele o mesmo peso
          visual dos controles que o usuário TOCA, e este não é tocável: é uma
          estatística de canto de tela. */}
      <View
        style={[styles.visitedStat, { bottom: TAB_BAR_CLEARANCE + insets.bottom }]}
        accessibilityRole="text"
        accessibilityLabel={`${visitedCount} de ${totalCountries} países visitados`}
      >
        <Text style={styles.visitedCount}>{visitedCount}</Text>
        <Text style={styles.visitedTotal}>de {totalCountries} países</Text>
      </View>

      {/* A folha da parada: a MESMA nas duas plataformas — no nativo ela flutua
          sobre a WebView do globo, no web sobre o canvas. */}
      <NearbyPlacesSheet
        stop={selectedStop}
        cluster={clusterGroup}
        places={nearby.places}
        loading={nearby.loading}
        failed={nearby.failed}
        minutes={nearby.minutes}
        onSelectStop={handleSelectStop}
        onFocusPlace={handleFocusPlace}
        onNavigatePlace={handleNavigatePlace}
        focusedPlaceId={focusedPlace?.id || null}
        onHeightChange={setSheetHeight}
        onClose={handleDismissPlanSelection}
        bottom={TAB_BAR_CLEARANCE + insets.bottom + SHEET_LIFT}
      />

      {/* O aviso divide o topo esquerdo com o seletor de dia: quando há dias
          para escolher, ele desce para baixo da fileira de chips. */}
      {(loading || error || nativeMapError) && (
        <View style={[styles.notice, planDayList.length > 1 && styles.noticeBelowTabs]}>
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

const glass = {
  backgroundColor: 'rgba(13,19,38,0.92)',
  borderWidth: 1,
  borderColor: 'rgba(108,43,217,0.4)',
};

// Abaixo da barra de IA (44px de altura a partir do topo 16) mais uma folga.
const PLAN_TABS_TOP = 70;

// A folha sobe um pouco acima do contador de países, para não cobrir a
// estatística no canto.
const SHEET_LIFT = 30;

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
  visitedStat: {
    position: 'absolute',
    right: 16,
    // `bottom` vem do componente (16 + safe area inset).
    zIndex: 1001,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  visitedCount: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    fontWeight: '700',
    // A sombra faz as vezes do fundo que o pill dava: o texto claro precisa
    // continuar legível sobre deserto, neve e nuvem.
    textShadowColor: 'rgba(5,7,15,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  visitedTotal: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    textShadowColor: 'rgba(5,7,15,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statText: {
    color: 'rgba(255,255,255,0.65)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  noticeBelowTabs: { top: PLAN_TABS_TOP + 48 },
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
