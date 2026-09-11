import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PlatformPressable } from '@react-navigation/elements';
import {
  TouchableOpacity, View, ActivityIndicator, StyleSheet,
  Modal, ScrollView, Text, Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS } from '../utils/constants';
import { TAB_BAR_HEIGHT, TAB_BAR_BOTTOM } from '../utils/tabBarLayout';
import { completeWebOAuthSession, getCurrentUser, supabase } from '../services/supabase';
import { useUpload } from '../context/UploadContext';
import { cancelAccountDeletion } from '../services/profileService';
import { notify } from '../utils/dialogs';
import { navigationRef } from './navigationRef';
import GlobalNotificationBanner from '../components/GlobalNotificationBanner';
import ScreenErrorBoundary from '../components/ScreenErrorBoundary';
import { OnboardingProvider, useOnboardingFlow } from '../context/OnboardingContext';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import ChooseUsernameScreen from '../screens/onboarding/ChooseUsernameScreen';

// Screens
import ExploreScreen from '../screens/explore/ExploreScreen';
import FeedScreen from '../screens/feed/FeedScreen';
import GlobeScreen from '../screens/map/GlobeScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ConfirmEmailScreen from '../screens/auth/ConfirmEmailScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import UploadPlaceholder from '../screens/upload/UploadPlaceholder';
import PhotoUploader from '../components/PhotoUploader';
import PublicProfileScreen from '../screens/profile/PublicProfileScreen';
import AssistantResultScreen from '../screens/assistant/AssistantResultScreen';
import TripPlannerScreen from '../screens/assistant/TripPlannerScreen';
import SavedTripsScreen from '../screens/assistant/SavedTripsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ConnectionsScreen from '../screens/profile/ConnectionsScreen';
import PhotoDetailScreen from '../screens/PhotoDetailScreen';
import SupportScreen from '../screens/support/SupportScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import ConversationScreen from '../screens/messages/ConversationScreen';
import PassportDetailScreen from '../screens/profile/PassportDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/**
 * Envolve uma tela num ScreenErrorBoundary.
 *
 * Um erro de render ou de efeito desmonta a árvore inteira acima de onde
 * estourou, e sem um boundary no caminho o que sobra é uma tela em branco — foi
 * assim que o erro de canal Realtime do Feed apagou o app (ver
 * services/realtimeChannel.js).
 *
 * O boundary entra AQUI, entre o navegador e a tela, e não dentro de cada tela:
 * assim a tab bar fica de fora do que pode quebrar, e quem cair na mensagem de
 * erro ainda consegue navegar para outro lugar em vez de ficar preso.
 *
 * O `useMemo` de quem chama não é necessário porque isto roda uma vez, no
 * módulo: o componente devolvido é estável, e um componente novo a cada render
 * remontaria a tela inteira sem parar.
 */
const withErrorBoundary = (Screen, name) => {
  const Wrapped = (props) => (
    <ScreenErrorBoundary name={name}>
      <Screen {...props} />
    </ScreenErrorBoundary>
  );
  Wrapped.displayName = `WithErrorBoundary(${name})`;
  return Wrapped;
};

function ProfileStack() {
  return (
    <Stack.Navigator id="ProfileStack" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="SavedTrips" component={SavedTripsScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
    </Stack.Navigator>
  );
}

// As telas das tabs, cada uma com sua rede de segurança. Montadas no módulo, uma
// vez só — ver o comentário acima.
const FeedScreenSafe = withErrorBoundary(FeedScreen, 'Feed');
const GlobeScreenSafe = withErrorBoundary(GlobeScreen, 'Mapa');
const ExploreScreenSafe = withErrorBoundary(ExploreScreen, 'Explorar');
const ProfileStackSafe = withErrorBoundary(ProfileStack, 'Perfil');

// Raio da pílula do item ativo. Fecha a cápsula do item sem competir com o raio
// da barra, que é maior.
const TAB_ITEM_RADIUS = 27;

/**
 * Botão do item da tab bar.
 *
 * Existe por um detalhe do @react-navigation/bottom-tabs v7: o
 * `tabBarActiveBackgroundColor` é pintado no pressable INTERNO, e o raio desse
 * pressable é fixo em 0 na variante padrão —
 * `borderRadius = variant === 'material' ? … : sidebar && horizontal ? 10 : 0`
 * (BottomTabItem.js). O `tabBarItemStyle` estiliza só o View de FORA, então
 * nenhum `borderRadius` passado por lá alcança o fundo colorido: o resultado era
 * um retângulo roxo de canto vivo preenchendo o item inteiro, sem seguir o
 * arredondado do menu.
 *
 * A correção é reaplicar o raio depois do estilo que a lib injeta — daí o
 * `props.style` vir primeiro no array. `PlatformPressable` é o mesmo componente
 * que a lib usaria, então ripple, hover e opacidade de toque continuam iguais.
 */
/**
 * `children` é obrigatório no tipo do PlatformPressable e chega dentro de
 * `props`, vindo do próprio React Navigation — daí ele aparecer na assinatura.
 *
 * @param {{ style?: any, clip?: boolean, children: React.ReactNode } & Record<string, any>} props
 */
function TabBarButton({ style = undefined, clip = true, ...props }) {
  return (
    <PlatformPressable
      {...props}
      style={[
        style,
        {
          borderRadius: TAB_ITEM_RADIUS,
          // Recorta o ripple do Android à pílula; sem isso ele voltaria a
          // desenhar o quadrado que acabamos de tirar. O botão "+" passa
          // `clip={false}`: ele sobe além do item e seria decepado de novo.
          overflow: clip ? 'hidden' : 'visible',
        },
      ]}
    />
  );
}

function TabNavigator() {
  const { openUploader } = useUpload();
  const { width } = useWindowDimensions();
  const tabBarWidth = Math.min(Math.max(width - 24, 300), 680);
  return (
    <Tab.Navigator
      id="MainTabs"
      initialRouteName="Feed"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#8F96B3',
        tabBarActiveBackgroundColor: 'rgba(108,43,217,0.34)',
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => <TabBarButton {...props} />,
        tabBarStyle: {
          position: 'absolute',
          left: (width - tabBarWidth) / 2,
          bottom: TAB_BAR_BOTTOM,
          width: tabBarWidth,
          backgroundColor: '#12182B',
          // Só `borderWidth`: com `borderTopWidth` junto, o topo ficava com uma
          // linha mais forte que o resto da borda e a cápsula perdia a simetria.
          borderWidth: 1,
          borderColor: 'rgba(167,139,250,0.28)',
          paddingHorizontal: 8,
          paddingVertical: 0,
          height: TAB_BAR_HEIGHT,
          borderRadius: TAB_BAR_HEIGHT / 2,
          ...Platform.select({
            web: { boxShadow: '0 12px 32px rgba(4,7,18,0.42)' },
            default: {
              shadowColor: '#050816',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.34,
              shadowRadius: 18,
              elevation: 14,
            },
          }),
        },
        // A pílula do item ativo precisa caber DENTRO da cápsula: com margem 1
        // ela encostava na borda e vazava pela curva do canto. Margem 8 no
        // vertical deixa 54 de altura para a pílula.
        //
        // O raio vive no TabBarButton, não aqui: este estilo vai para o View de
        // fora, e é o pressable de dentro que recebe a cor de fundo.
        tabBarItemStyle: {
          height: TAB_BAR_HEIGHT - 16,
          marginVertical: 8,
          marginHorizontal: 2,
          paddingVertical: 0,
          // Sem `overflow: hidden`: é ele que decepava o topo do botão "+", que
          // sobe além do item de propósito.
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          marginTop: 2,
          marginBottom: 0,
        },
      }}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreenSafe}
        options={{
          tabBarLabel: 'Início',
          tabBarIcon: ({ size, color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Map"
        component={GlobeScreenSafe}
        options={{
          tabBarLabel: 'Mapa',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="QuickUpload"
        component={UploadPlaceholder}
        options={{
          tabBarLabel: () => null,
          // O "+" não navega (o tabPress abre o uploader), então ele nunca fica
          // "ativo" — pintar a pílula atrás dele só faria um borrão roxo em volta
          // de um botão que já é roxo.
          tabBarActiveBackgroundColor: 'transparent',
          tabBarButton: (props) => <TabBarButton {...props} clip={false} />,
          tabBarIcon: () => (
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: '#6C2BD9',
              alignItems: 'center',
              justifyContent: 'center',
              // Sobe para a borda da cápsula, como um FAB. Os itens vizinhos têm
              // ícone + rótulo; este só tem o círculo, então o deslocamento é o
              // que alinha o centro dele com o centro dos ícones ao lado.
              marginTop: -6,
              ...Platform.select({
                web: { boxShadow: '0 4px 8px rgba(108,43,217,0.4)' },
                default: {
                  shadowColor: '#6C2BD9',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                  elevation: 6,
                },
              }),
            }}>
              <Ionicons name="add" size={28} color="white" />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            // @ts-expect-error React Navigation's JS event supports cancellation here.
            e.preventDefault();
            openUploader();
          },
        }}
      />

      <Tab.Screen
        name="Explore"
        component={ExploreScreenSafe}
        options={{
          tabBarLabel: 'Explorar',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileStackSafe}
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(() => (
    Platform.OS === 'web'
    && typeof window !== 'undefined'
    && new URL(window.location.href).searchParams.get('recovery') === '1'
  ));

  const { visible, openUploader, closeUploader, notifyUploadComplete } = useUpload();
  // Gatilho do onboarding de boas-vindas: só conta nova
  // (`profiles.onboarding_completed = false`) chega a ver a tela.
  // O fluxo é chamado aqui e SÓ aqui: este componente precisa do resultado
  // direto (overlay dos slides, boot segurado) e o provider abaixo entrega o
  // mesmo objeto para a tela do globo, que renderiza a etapa guiada.
  const onboarding = useOnboardingFlow(user);
  const checkingOnboarding = onboarding.checking;
  const [detectedLocation, setDetectedLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      try {
        await completeWebOAuthSession();
      } catch (error) {
        // A tela de login segue disponível quando o OAuth é cancelado ou recusado,
        // mas o motivo precisa aparecer: engolir isso escondeu por muito tempo a
        // falha de troca do code do Google.
        console.error('[auth] Falha ao concluir o OAuth na web:', error);
      }

      const result = await getCurrentUser();

      if (result && result.id) {
        setUser(result);
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    // `cancel_account_deletion` devolve false quando não havia exclusão pendente,
    // então chamar sempre resolve o caso comum e o de reativação com uma ida só
    // ao banco — ler o perfil antes, só para decidir se vale chamar, seria uma
    // consulta a mais em todo login.
    const reactivateIfPending = async () => {
      const reativou = await cancelAccountDeletion();
      if (reativou) {
        notify(
          'Sua conta está sendo reativada',
          'Que bom que você voltou. Seu perfil, suas fotos e seu histórico continuam como estavam.'
        );
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (session?.user) {
        setUser(session.user);
        // Reativação: entrar de novo dentro da carência desfaz a exclusão.
        //
        // O gancho vive AQUI, e não no LoginScreen, porque este é o único ponto
        // por onde passam os três caminhos de entrada — e-mail, Google e
        // restauração de sessão. Só no LoginScreen, quem entrasse pelo Google
        // continuaria com a conta marcada para apagar.
        if (event === 'SIGNED_IN') reactivateIfPending();
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const finishPasswordRecovery = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('recovery');
      window.history.replaceState({}, document.title, `${cleanUrl.pathname}${cleanUrl.search}`);
    }
    setUser(null);
    setPasswordRecovery(false);
  };

  useEffect(() => {
    if (visible) {
      setDetectedLocation(null);
      detectLocation();
    }
  }, [visible]);

  const detectLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationLoading(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      let detected = null;

      if (Platform.OS === 'web') {
        // Nominatim (OpenStreetMap) — gratuito, sem API key, funciona na web
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}&zoom=10&addressdetails=1`,
          { headers: { 'Accept-Language': 'pt-BR' } }
        );
        const data = await response.json();
        const address = data.address || {};
        const city = address.city || address.town || address.village || address.municipality || address.county || '';
        const countryName = address.country || '';
        const isoCountryCode = (address.country_code || '').toUpperCase();

        if (city || countryName) {
          detected = { city, countryName, isoCountryCode };
        }
      } else {
        // Nativo (iOS/Android) — expo-location funciona normalmente
        const geocode = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (geocode && geocode[0]) {
          const place = geocode[0];
          detected = {
            city: place.city || place.subregion || place.region || '',
            countryName: place.country || '',
            isoCountryCode: place.isoCountryCode || '',
          };
        }
      }

      if (detected) {
        detected = {
          ...detected,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setDetectedLocation(detected);
      }
    } catch {
      setDetectedLocation(null);
    } finally {
      setLocationLoading(false);
    }
  };

  // `checkingOnboarding` entra aqui para a conta nova não ver o feed por um
  // instante antes do onboarding cair por cima. Quem já concluiu resolve pelo
  // cache local, sem passar por este estado.
  if (loading || (user && checkingOnboarding)) {
    return (
      <ActivityIndicator
        size="large"
        color={COLORS.primary}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* O provider embrulha o NavigationContainer porque quem renderiza a etapa
          guiada é a GlobeScreen, lá dentro. */}
      <OnboardingProvider value={onboarding}>
        <NavigationContainer ref={navigationRef}>
          {passwordRecovery ? (
            <Stack.Navigator id="PasswordRecoveryStack" screenOptions={{ headerShown: false }}>
              <Stack.Screen name="ResetPassword">
                {props => <ResetPasswordScreen {...props} onComplete={finishPasswordRecovery} />}
              </Stack.Screen>
            </Stack.Navigator>
          ) : !user ? (
            <Stack.Navigator id="AuthStack" screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
              <Stack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} />
              <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
              <Stack.Screen name="Support" component={SupportScreen} />
            </Stack.Navigator>
          ) : (
            <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Main" component={TabNavigator} />
              <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
              <Stack.Screen name="PhotoDetail" component={PhotoDetailScreen} />
              <Stack.Screen name="Messages" component={MessagesScreen} />
              <Stack.Screen name="Conversation" component={ConversationScreen} />
              <Stack.Screen name="PassportDetail" component={PassportDetailScreen} />
              <Stack.Screen
                name="TripPlanner"
                component={TripPlannerScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="AssistantResult"
                component={AssistantResultScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Notificações"
                component={NotificationsScreen}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="Connections"
                component={ConnectionsScreen}
                options={{ headerShown: false }}
              />
            </Stack.Navigator>
          )}
        </NavigationContainer>
      </OnboardingProvider>

      {/* Slides de boas-vindas. Ficam FORA do NavigationContainer, cobrindo o
          app inteiro: não são destino de navegação (não têm voltar, não entram
          no histórico).
          "Começar" NÃO encerra o onboarding — ele leva ao globo e passa a bola
          para a etapa guiada, que é quem grava `onboarding_completed`.
          "Pular" encerra tudo de uma vez. */}
      {onboarding.showSlides && (
        <View style={StyleSheet.absoluteFill}>
          <OnboardingScreen
            onFinish={onboarding.finishSlides}
            onSkip={onboarding.finishOnboarding}
            saving={onboarding.saving}
          />
        </View>
      )}

      {/* Escolha do username — só quem entrou pelo Google chega aqui, e vem
          ANTES dos slides. Fica por último no JSX para cobrir o overlay do
          onboarding: as duas fases são mutuamente exclusivas, mas a ordem de
          pintura não pode depender disso. */}
      {onboarding.showUsername && user && (
        <View style={StyleSheet.absoluteFill}>
          <ChooseUsernameScreen
            userId={user.id}
            suggestion={onboarding.suggestedUsername}
            saving={onboarding.saving}
            onConfirm={onboarding.saveUsername}
          />
        </View>
      )}

      {/* Banner global de notificações — irmão do NavigationContainer para cobrir
          qualquer tela. `suppressed` porque, no nativo, o Modal de upload abre numa
          janela separada do SO e ficaria por cima do banner: a notificação espera na
          fila e aparece quando o modal fecha. */}
      <GlobalNotificationBanner userId={user?.id || null} suppressed={visible} />

      {/* Modal global de upload com detecção de GPS */}
      {user && (
        <Modal
          visible={visible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeUploader}
        >
          <View style={{ flex: 1, backgroundColor: 'white' }}>
            {/* Header */}
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
                Nova publicação
              </Text>
              <TouchableOpacity onPress={closeUploader}>
                <Ionicons name="close" size={24} color="#0D1326" />
              </TouchableOpacity>
            </View>

            {/* Indicador de detecção de GPS */}
            {locationLoading && (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                paddingHorizontal: 16,
                backgroundColor: '#fffbf5',
                borderBottomWidth: 0.5,
                borderBottomColor: '#ffe4cc',
              }}>
                <ActivityIndicator size="small" color="#6C2BD9" />
                <Text style={{ fontSize: 12, color: '#6C2BD9', fontWeight: '500' }}>
                  Detectando sua localização...
                </Text>
              </View>
            )}

            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ padding: 16 }}>
                <PhotoUploader
                  userId={user?.id}
                  prefilledCity={detectedLocation?.city}
                  prefilledCountryName={detectedLocation?.countryName}
                  prefilledCountryCode={detectedLocation?.isoCountryCode}
                  prefilledCityLat={detectedLocation?.latitude}
                  prefilledCityLng={detectedLocation?.longitude}
                  onPhotoUploaded={notifyUploadComplete}
                />
              </View>
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}
