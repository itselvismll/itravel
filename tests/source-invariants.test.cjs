const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Invariantes sobre "o que o código faz" precisam ignorar comentários — senão um
// comentário que apenas *menciona* uma regra passa a violá-la. O `[^:]` antes de `//`
// preserva URLs (`https://...`), que não são comentário.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

test('Supabase configuration is environment-only', () => {
  const constants = read('src/utils/constants.js');
  assert.doesNotMatch(constants, /SUPABASE_ANON_KEY:\s*process\.env[^\n]+\|\|/);
  assert.match(constants, /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(constants, /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
});

test('AI function validates authentication and destination input', () => {
  const handler = read('supabase/functions/travel-assistant/index.ts');
  assert.match(handler, /Authorization/);
  assert.match(handler, /destino v[áa]lido/i);
  assert.match(handler, /gemini-3\.6-flash/);
  assert.doesNotMatch(handler, /gemini-1\.5-flash/);
  assert.doesNotMatch(handler, /temperature:/);
  assert.match(handler, /responseMimeType: 'application\/json'/);
  assert.match(handler, /responseSchema,/);
});

test('travel planner is personalized, structured, cancellable, and editable', () => {
  const assistant = read('src/services/assistantService.js');
  const planner = read('src/screens/assistant/TripPlannerScreen.js');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  const map = read('src/screens/map/GlobeScreen.js');
  assert.match(assistant, /refreshSession/);
  assert.match(assistant, /AbortController/);
  assert.match(assistant, /regeneratePlanActivity/);
  assert.match(assistant, /adjustTravelPlan/);
  for (const field of ['origin', 'destination', 'startDate', 'endDate', 'travelers', 'budget', 'pace', 'interests', 'foodPreferences', 'accessibility']) {
    assert.match(planner, new RegExp(field));
  }
  assert.match(result, /saveTripPlan/);
  assert.match(result, /toggleChecklist/);
  assert.match(result, /openMap/);
  assert.match(result, /startEditing/);
  assert.match(result, /Ajuste este roteiro com IA/);
  assert.match(map, /navigation\.navigate\('TripPlanner'\)/);
});

test('AI planner enriches plans with dated weather, verified places, currency, and sources', () => {
  const handler = read('supabase/functions/travel-assistant/index.ts');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  assert.match(handler, /start_date/);
  assert.match(handler, /end_date/);
  assert.match(handler, /GOOGLE_PLACES_API_KEY/);
  assert.match(handler, /overpass-api\.de/);
  assert.match(handler, /restcountries\.com/);
  assert.match(handler, /api\.frankfurter\.dev\/v2\/rate/);
  assert.match(handler, /adjust_plan/);
  assert.match(result, /activity\.rating/);
  assert.match(result, /activity\.openingHours/);
});

test('travel planner uses a calendar, blocks past dates, and sends ISO dates', () => {
  const planner = read('src/screens/assistant/TripPlannerScreen.js');
  const calendar = read('src/components/CalendarField.js');
  const dateUtils = read('src/utils/dateUtils.js');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  assert.match(planner, /<CalendarField/);
  assert.match(planner, /A data de ida não pode estar no passado/);
  assert.match(planner, /startDate: form\.useDates \? toIsoDate\(form\.startDate\)/);
  assert.match(calendar, /disabled = startOfDay\(date\) < minimum/);
  assert.match(dateUtils, /parseBrazilianDate/);
  assert.match(result, /toBrazilianDate\(request\.startDate\)/);
});

test('saved travel plans are private and available from the profile', () => {
  const migration = read('supabase/migrations/20260731120000_create_travel_plans.sql');
  const service = read('src/services/tripPlanService.js');
  const profile = read('src/screens/profile/ProfileScreen.js');
  assert.match(migration, /create table if not exists public\.travel_plans/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(service, /LOCAL_STORAGE_KEY/);
  assert.match(profile, /SavedTrips/);
});

test('client source does not contain Google API keys', () => {
  const uploader = read('src/components/PhotoUploader.js');
  assert.doesNotMatch(uploader, /AIza[0-9A-Za-z_-]{20,}/);
  assert.match(uploader, /API_CONFIG\.GOOGLE_MAPS_API_KEY/);
});

test('photo picker supports web and native platforms', () => {
  const uploader = read('src/components/PhotoUploader.js');
  assert.match(uploader, /process\.env\.EXPO_OS === 'web'/);
  assert.match(uploader, /ImagePicker\.launchImageLibraryAsync/);
  assert.match(uploader, /mediaTypes: \['images'\]/);
});

test('web dialogs have browser implementations', () => {
  const dialogs = read('src/utils/dialogs.js');
  assert.match(dialogs, /globalThis\.confirm/);
  assert.match(dialogs, /globalThis\.alert/);
});

test('email-confirmation signup creates profiles through a database trigger', () => {
  const authService = read('src/services/supabase.js');
  const migration = read('supabase/migrations/20260721120000_create_profiles_on_signup.sql');
  assert.match(authService, /options:\s*\{\s*data:/);
  assert.match(migration, /after insert on auth\.users/);
  assert.match(migration, /security definer/);
});

test('legacy users are backfilled before comments reference profiles', () => {
  const migration = read('supabase/migrations/20260724120000_repair_profiles_and_comments.sql');
  assert.match(migration, /from auth\.users/);
  assert.match(migration, /references public\.profiles \(id\)/);
  assert.match(migration, /validate constraint comments_user_id_fkey/);
});

test('profile updates repair missing identities before partial changes', () => {
  const profileService = read('src/services/profileService.js');
  const migration = read('supabase/migrations/20260729160000_ensure_profile_identity.sql');
  const socialService = read('src/services/socialService.js');
  assert.match(profileService, /rpc\('ensure_current_user_profile'\)/);
  assert.match(profileService, /\.update\(sanitizedUpdates\)/);
  assert.match(profileService, /supabase\.auth\.updateUser/);
  assert.match(migration, /from auth\.users/);
  assert.match(migration, /grant execute on function public\.ensure_current_user_profile\(\) to authenticated/);
  assert.match(migration, /raw_user_meta_data ->> 'picture'/);
  assert.match(socialService, /profiles!comments_user_id_fkey/);
  assert.match(socialService, /\.single\(\)/);
});

test('avatars always display an initial when no usable image exists', () => {
  const avatar = read('src/components/Avatar.js');
  const feed = read('src/screens/feed/FeedScreen.js');
  assert.match(avatar, /fallbackName = 'Viajante'/);
  assert.match(avatar, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(feed, /fallbackName=/);
});

test('photo uploads always synchronize their country as visited', () => {
  const migration = read('supabase/migrations/20260724150000_sync_photo_country_visits.sql');
  const uploader = read('src/components/PhotoUploader.js');
  assert.match(migration, /after insert or update/);
  assert.match(migration, /insert into public\.visited_countries/);
  assert.match(uploader, /markCountryAsVisited/);
  assert.doesNotMatch(uploader, /lat:\s*0/);
});

test('map refreshes visits after uploads and counts them from normalized codes', () => {
  // Era a MapScreen quem normalizava os códigos do banco e desenhava o anel de
  // porcentagem. Com o globo no lugar dela, a normalização virou toAlpha3Set e a
  // estatística virou a barra de progresso — os dados e a conta são os mesmos.
  const status = read('src/components/map/countryStatus.js');
  const globe = read('src/screens/map/GlobeScreen.js');
  assert.match(status, /getAlpha3/);
  assert.match(status, /toAlpha3Set/);
  assert.match(globe, /visitedCount \/ TOTAL_COUNTRIES/);
  assert.match(globe, /progressFill/);
});

test('the globe keeps the whole planet in frame instead of a bounded flat world', () => {
  // O invariante do Leaflet (maxBounds/noWrap contra áreas polares em branco) não
  // tem equivalente aqui: numa esfera não existe borda por onde vazar. O que
  // precisa ficar preso é a projeção globe e o limite de afastamento da câmera.
  const config = read('src/components/map/globeConfig.js');
  const globeMap = read('src/components/map/GlobeMap.web.js');
  assert.match(globeMap, /setProjection\(\{ type: 'globe' \}\)/);
  assert.match(config, /minZoom: 0/);
  assert.match(globeMap, /minZoom: GLOBE_INITIAL_VIEW\.minZoom/);
});

test('map resolves sovereign countries that arrive without ISO codes', () => {
  const geoCountryUtils = read('src/utils/geo-country-utils.js');
  const fill = read('src/components/map/countryFill.js');
  const anchors = read('src/components/map/countryCentroids.js');
  assert.match(geoCountryUtils, /France: 'FRA'/);
  assert.match(geoCountryUtils, /Norway: 'NOR'/);
  // Território pintado e badge resolvem o código pela mesma função, senão os dois
  // discordam sobre quais features são países.
  assert.match(fill, /getGeoCountryAlpha3\(feature\)/);
  assert.match(anchors, /getGeoCountryAlpha3\(feature\)/);
});

test('follow events create notifications and connection lists are navigable', () => {
  const migration = read('supabase/migrations/20260724190000_follow_notifications.sql');
  const navigation = read('src/navigation/AppNavigator.js');
  const connections = read('src/screens/profile/ConnectionsScreen.js');
  assert.match(migration, /after insert on public\.followers/);
  assert.match(migration, /insert into public\.notifications/);
  assert.match(navigation, /name="Connections"/);
  assert.match(connections, /getFollowerProfiles/);
  assert.match(connections, /getFollowingProfiles/);
});

test('comment notifications keep a photo target and open the publication', () => {
  const migration = read('supabase/migrations/20260729110000_photo_notifications_and_social_auth.sql');
  const notifications = read('src/screens/NotificationsScreen.js');
  const navigation = read('src/navigation/AppNavigator.js');
  assert.match(migration, /notifications_photo_id_fkey/);
  assert.match(migration, /attach_comment_notification_target/);
  assert.match(notifications, /getNotificationDestination/);
  assert.doesNotMatch(notifications, /photoThumb/);
  assert.match(navigation, /name="PhotoDetail"/);
});

test('planning, messaging, passport, and explore improvements stay integrated', () => {
  const planner = read('src/screens/assistant/TripPlannerScreen.js');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  const messages = read('src/services/messageService.js');
  const navigation = read('src/navigation/AppNavigator.js');
  const profile = read('src/screens/profile/ProfileScreen.js');
  const explore = read('src/screens/explore/ExploreScreen.js');
  const migration = read('supabase/migrations/20260805190000_social_planning_and_explore.sql');
  const notificationMigration = read('supabase/migrations/20260807193000_message_passport_notifications.sql');
  const routing = read('src/utils/notificationRouting.js');
  assert.match(planner, /DestinationBudgetPlanner/);
  assert.match(planner, /LocationAutocomplete/);
  assert.match(planner, /MultiCountrySelector/);
  assert.match(planner, /formatMoneyInput/);
  assert.match(planner, /form\.travelerType === 'Casal'/);
  assert.match(result, /Abrir meus roteiros salvos/);
  assert.match(navigation, /name="Messages"/);
  assert.match(navigation, /name="Conversation"/);
  assert.match(navigation, /name="PassportDetail"/);
  assert.match(messages, /shared_plan/);
  assert.match(messages, /shared_passport/);
  assert.match(routing, /REGISTERED_ROUTES/);
  assert.match(routing, /passportShareId/);
  assert.match(profile, /Opções da publicação/);
  assert.match(profile, /navigator\.share/);
  assert.doesNotMatch(explore, />EXPLORAR POR DESTINO</);
  assert.match(explore, /getAlpha3\(photo\.country_code\)/);
  assert.match(migration, /remove_visited_country_from_wishlist/);
  assert.match(migration, /notify_comment_once/);
  assert.match(migration, /create table if not exists public\.conversations/);
  assert.match(notificationMigration, /create table if not exists public\.passport_shares/);
  assert.match(notificationMigration, /notify_new_message/);
  assert.match(notificationMigration, /notify_received_passport/);
  assert.match(notificationMigration, /notifications_conversation_id_fkey/);
  assert.match(notificationMigration, /notifications_passport_share_id_fkey/);
});

test('public profiles show spaced photo cards with captions and comments', () => {
  const profile = read('src/screens/profile/PublicProfileScreen.js');
  const detail = read('src/screens/PhotoDetailScreen.js');
  assert.match(profile, /gap: 12/);
  assert.match(profile, /photo\.caption/);
  assert.match(profile, /photo\.comment_count/);
  assert.match(profile, /Voltar ao menu/);
  assert.match(detail, /getComments/);
  assert.match(detail, /addComment/);
});

test('Google login uses Supabase OAuth and Expo browser callbacks', () => {
  const auth = read('src/services/supabase.js');
  const login = read('src/screens/auth/LoginScreen.js');
  const app = read('app.json');
  assert.match(auth, /signInWithOAuth/);
  assert.match(auth, /openAuthSessionAsync/);
  assert.match(auth, /exchangeCodeForSession/);
  assert.match(auth, /completeWebOAuthSession/);
  assert.match(auth, /flowType: 'pkce'/);
  assert.match(auth, /new URLSearchParams\(callbackUrl\.hash/);
  assert.match(auth, /window\.history\.replaceState/);
  assert.match(auth, /API_CONFIG\.WEB_APP_URL/);
  assert.doesNotMatch(auth, /isLocalDevelopment/);
  assert.match(auth, /Platform\.OS === 'web'\) return API_CONFIG\.WEB_APP_URL/);
  assert.match(login, /signInWithGoogle/);
  assert.match(app, /"scheme": "journi"/);
  assert.match(app, /"expo-web-browser"/);
});

test('client source is free of console calls and centralizes remote flag images', () => {
  const sourceRoot = path.join(root, 'src');
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (/\.[jt]sx?$/.test(entry.name)) files.push(absolute);
    }
  };
  visit(sourceRoot);
  const source = files.map(file => stripComments(fs.readFileSync(file, 'utf8'))).join('\n');
  const countryFlag = read('src/components/CountryFlag.js');
  assert.doesNotMatch(source, /console\.(log|debug|info|warn|error)\s*\(/);
  assert.match(countryFlag, /https:\/\/flagcdn\.com\//);
  assert.match(countryFlag, /cache: 'force-cache'/);

  // A regra é de centralização: só o CountryFlag pode montar a URL remota da bandeira.
  // Checar quais arquivos a constroem (em vez de contar ocorrências no texto bruto) dá
  // uma falha que aponta o culpado e não quebra quando alguém cita o domínio num comentário.
  const filesBuildingFlagUrls = files
    .filter(file => /https:\/\/flagcdn\.com\//.test(stripComments(fs.readFileSync(file, 'utf8'))))
    .map(file => path.relative(root, file).split(path.sep).join('/'));
  assert.deepEqual(filesBuildingFlagUrls, ['src/components/CountryFlag.js']);
});

test('explore, feed, and passport keep their responsive visual treatment', () => {
  const explore = read('src/screens/explore/ExploreScreen.js');
  const feed = read('src/screens/feed/FeedScreen.js');
  const profile = read('src/screens/profile/ProfileScreen.js');
  assert.match(explore, /<CountryFlag/);
  assert.match(feed, /maxWidth: 760/);
  assert.match(feed, /aspectRatio: 4 \/ 3/);
  assert.match(profile, /tagCountryMark/);
  assert.match(profile, /<CountryFlag/);
  assert.match(explore, /maxWidth: 1100/);
  assert.match(feed, /countryCode=\{post\.country_code\}/);
});

test('users can delete only their own posts from feed and profile', () => {
  const service = read('src/services/photoService.js');
  const feedService = read('src/services/followService.js');
  const feed = read('src/screens/feed/FeedScreen.js');
  const profile = read('src/screens/profile/ProfileScreen.js');
  const migration = read('supabase/migrations/20260804160000_delete_own_posts.sql');

  assert.match(service, /export const deletePhoto/);
  assert.match(service, /\.eq\('user_id', user\.id\)/);
  assert.match(feedService, /photo_path/);
  assert.match(feed, /post\.user_id === currentUser\?\.id/);
  assert.match(feed, /accessibilityLabel="Excluir publicação"/);
  assert.match(profile, /handleDeletePhoto\(fullscreenPhoto\)/);
  assert.match(profile, /accessibilityLabel="Excluir publicação"/);
  assert.match(migration, /on delete cascade/);
  assert.match(migration, /clear_deleted_photo_cover/);
});

test('feed is the home tab with floating navigation and top-level social actions', () => {
  const navigator = read('src/navigation/AppNavigator.js');
  const feed = read('src/screens/feed/FeedScreen.js');
  assert.match(navigator, /initialRouteName="Feed"/);
  assert.match(navigator, /borderRadius: 35/);
  assert.match(navigator, /name="Messages" component=\{MessagesScreen\}/);
  assert.doesNotMatch(navigator, /tabBarLabel: 'Conversas'/);
  assert.match(feed, /accessibilityLabel="Abrir conversas"/);
  assert.match(feed, /accessibilityLabel="Abrir notificações"/);
});

test('planner converts currencies, keeps free activities at zero, and exposes verified ticket sites', () => {
  const currency = read('src/services/currencyService.js');
  const planner = read('src/screens/assistant/TripPlannerScreen.js');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  const assistant = read('supabase/functions/travel-assistant/index.ts');
  const explore = read('src/screens/explore/ExploreScreen.js');

  assert.match(currency, /api\.frankfurter\.dev\/v2\/rate/);
  assert.match(planner, /destinationBudgets/);
  assert.match(planner, /destinations\.map/);
  assert.match(result, /Number\(value\) === 0/);
  assert.match(result, /Site oficial/);
  assert.match(assistant, /officialUrl/);
  assert.match(assistant, /Nunca invente links de ingresso/);
  assert.match(explore, /!!fullscreenPhoto && fullscreenPhoto\.user_id === currentUser\?\.id/);
  assert.match(explore, /handleDeleteCountryPhoto/);
});

test('password recovery sends a secure link and requires a new password', () => {
  const login = read('src/screens/auth/LoginScreen.js');
  const forgot = read('src/screens/auth/ForgotPasswordScreen.js');
  const reset = read('src/screens/auth/ResetPasswordScreen.js');
  const auth = read('src/services/supabase.js');
  const navigator = read('src/navigation/AppNavigator.js');
  assert.match(login, /Esqueceu sua senha\?/);
  assert.match(auth, /resetPasswordForEmail/);
  assert.match(auth, /redirectTo: getPasswordRecoveryRedirectUrl\(\)/);
  assert.match(reset, /updateRecoveredPassword/);
  assert.match(forgot, /requestPasswordReset/);
  assert.match(navigator, /PASSWORD_RECOVERY/);
});

test('long AI plans must contain exactly the requested duration and explain every cost', () => {
  const assistant = read('supabase/functions/travel-assistant/index.ts');
  const service = read('src/services/assistantService.js');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  assert.match(assistant, /minItems: duration/);
  assert.match(assistant, /maxItems: duration/);
  assert.match(assistant, /maxOutputTokens: 65535/);
  assert.match(assistant, /plan\.days\.length !== duration/);
  assert.match(service, /requestedDuration \* 6000/);
  assert.match(assistant, /shoppingIncluded/);
  assert.match(assistant, /Passagens, Hospedagem, Alimentação, Transporte local, Passeios e ingressos, Compras e Reserva/);
  assert.match(result, /O que esse valor inclui\?/);
  assert.match(result, /purchaseNote/);
});

test('trip budget is allocated per destination and consolidated in BRL', () => {
  const planner = read('src/screens/assistant/TripPlannerScreen.js');
  const destinationBudget = read('src/components/DestinationBudgetPlanner.js');
  const currency = read('src/services/currencyService.js');
  const assistant = read('supabase/functions/travel-assistant/index.ts');
  assert.match(planner, /<DestinationBudgetPlanner/);
  assert.match(planner, /destinationBudgets/);
  assert.match(destinationBudget, /Orçamento da viagem/);
  assert.match(destinationBudget, /Informe em reais e veja quanto terá na moeda de cada destino/);
  assert.match(destinationBudget, /TOTAL ESTIMADO/);
  assert.match(destinationBudget, /getCountryCurrency/);
  assert.match(destinationBudget, /Inverter moedas de/);
  assert.match(destinationBudget, /BASE_TO_LOCAL/);
  assert.match(currency, /restcountries\.com\/v3\.1\/alpha/);
  assert.match(currency, /'Argentine peso': 'ARS'/);
  assert.match(currency, /open\.er-api\.com\/v6\/latest/);
  assert.match(assistant, /amountInBRL/);
});

test('country photo fullscreen lets the owner delete the selected photo', () => {
  const gallery = read('src/components/PhotoGallery.js');
  const photoService = read('src/services/photoService.js');
  assert.match(gallery, /accessibilityLabel="Excluir esta foto"/);
  assert.match(gallery, /handleDelete\(fullscreenPhoto\.id, fullscreenPhoto\.photo_path\)/);
  assert.match(photoService, /\.eq\('user_id', user\.id\)/);
});

test('in-app notification banner is global, queued, and deep-linked', () => {
  const navigator = read('src/navigation/AppNavigator.js');
  const banner = read('src/components/GlobalNotificationBanner.js');
  const routing = read('src/utils/notificationRouting.js');
  const app = read('App.js');
  const migration = read('supabase/migrations/20260806120000_notification_deeplinks_and_realtime.sql');

  // O banner precisa ficar FORA do NavigationContainer: dentro dele voltaria a ser
  // recortado pela tela ativa, que é justamente o que o componente global evita.
  const containerEnd = navigator.indexOf('</NavigationContainer>');
  const bannerUsage = navigator.indexOf('<GlobalNotificationBanner');
  assert.ok(containerEnd > 0 && bannerUsage > containerEnd);
  assert.match(navigator, /<NavigationContainer ref=\{navigationRef\}>/);
  // Suprimir durante o upload: no nativo o Modal abre em janela própria e cobriria o banner.
  assert.match(navigator, /suppressed=\{visible\}/);
  assert.match(app, /<SafeAreaProvider>/);

  // Fila: uma notificação por vez, e nada é descartado enquanto estiver suprimido.
  assert.match(banner, /if \(suppressed \|\| current \|\| queue\.length === 0\) return;/);
  assert.match(banner, /setQueue\(prev => \[current, \.\.\.prev\]\)/);
  assert.match(banner, /event: 'INSERT'/);
  assert.match(banner, /filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(banner, /\.update\(\{ read: true \}\)/);
  assert.match(banner, /removeChannel/);

  // Rotas ainda inexistentes (DMs/passaporte) não podem ser navegadas às cegas.
  assert.match(banner, /isRouteRegistered\(route\.name\)/);
  assert.match(routing, /'Conversation'/);
  assert.match(routing, /'PassportDetail'/);
  assert.doesNotMatch(routing, /REGISTERED_ROUTES = \[[^\]]*'(Conversation|PassportDetail)'/s);

  // Sem o Realtime habilitado o canal conecta e nunca dispara.
  assert.match(migration, /alter publication supabase_realtime add table public\.notifications/);
  assert.match(migration, /add column if not exists target_id text/);
});

test('README keeps JWT verification enabled for the AI function', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /functions deploy travel-assistant --no-verify-jwt/);
});

test('message, seasonal explore, requirements, and decimal budget fixes stay integrated', () => {
  const migration = read('supabase/migrations/20260810162000_fix_message_notifications_and_unread.sql');
  const feed = read('src/screens/feed/FeedScreen.js');
  const publicProfile = read('src/screens/profile/PublicProfileScreen.js');
  const currency = read('src/services/currencyService.js');
  const budget = read('src/components/DestinationBudgetPlanner.js');
  const explore = read('src/screens/explore/ExploreScreen.js');
  const countryModal = read('src/components/map/CountryDetailModal.js');
  const requirements = read('src/services/travelRequirementsService.js');
  const assistant = read('supabase/functions/travel-assistant/index.ts');

  assert.match(migration, /'message', 'passport'/);
  assert.match(migration, /get_unread_message_count/);
  assert.match(feed, /CountBadge/);
  assert.doesNotMatch(feed, /styles\.stories/);
  assert.match(publicProfile, />Mensagem</);
  assert.match(currency, /sanitizeMoneyInput/);
  assert.match(budget, /keyboardType="decimal-pad"/);
  assert.match(explore, /DESTINOS EM ALTA NESTA ÉPOCA/);
  assert.match(explore, /getTourismImage/);
  assert.doesNotMatch(explore, /CountryRequirementsCard/);
  assert.match(countryModal, /CountryRequirementsCard/);
  assert.match(requirements, /MAY_REQUIRE_YELLOW_FEVER_CIVP/);
  assert.match(requirements, /ETIAS ainda não está em operação/);
  assert.match(assistant, /maxItems: 3/);
  assert.match(assistant, /gemini-3\.5-flash-lite/);
});

test('result details, exact maps, realtime chat, passport share, and follow-back stay integrated', () => {
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  const assistant = read('supabase/functions/travel-assistant/index.ts');
  const conversation = read('src/screens/messages/ConversationScreen.js');
  const realtime = read('supabase/migrations/20260810203000_messages_realtime.sql');
  const passport = read('src/screens/profile/PassportDetailScreen.js');
  const profile = read('src/screens/profile/PublicProfileScreen.js');

  assert.match(result, /plan\.budget\?\.items \|\| \[\]\)\.map/);
  assert.doesNotMatch(result, /Ver detalhamento completo/);
  assert.match(result, /query_place_id/);
  assert.match(assistant, /placeId/);
  assert.match(assistant, /'hotel'\),/);
  assert.match(conversation, /postgres_changes/);
  assert.match(realtime, /supabase_realtime add table public\.messages/);
  assert.match(passport, /<ShareCard/);
  assert.match(profile, /Seguir de volta/);
});

test('country modal lives in its own component, with the loading logic inside it', () => {
  // O modal era JSX inline dentro da MapScreen (Leaflet), que saiu do projeto na
  // promoção do globo. Ele continua num componente próprio: é o que permitiu as
  // duas telas coexistirem durante a migração, e o que deixa a próxima tela que
  // precisar do modal (passaporte, explorar) usá-lo sem copiar nada.
  const modal = read('src/components/map/CountryDetailModal.js');
  const globe = stripComments(read('src/screens/map/GlobeScreen.js'));

  assert.match(globe, /<CountryDetailModal/);
  assert.match(globe, /onVisitedChange=/);
  assert.match(globe, /onWishlistChange=/);

  // A tela não pode voltar a montar modal de país por conta própria.
  assert.doesNotMatch(globe, /<Modal\b/);

  // A lógica que estava na tela foi junto, inteira: detalhes, lugares, vizinhos,
  // marcação de visitado e wishlist, galeria e upload.
  for (const symbol of [
    'getCountryInfo',
    'getTopPlacesByCountry',
    'getBorderCountries',
    'getCountryCulturalData',
    'markCountryAsVisited',
    'unmarkCountryAsVisited',
    'addToWishlist',
    'removeFromWishlist',
    'isInWishlist',
    'PhotoGallery',
    'PhotoUploader',
  ]) {
    assert.match(modal, new RegExp(symbol), `${symbol} não sobreviveu à extração`);
  }
});

test('globe reuses the map controls instead of reimplementing them', () => {
  const globe = stripComments(read('src/screens/map/GlobeScreen.js'));

  // Barra de IA: mesmo destino de navegação da MapScreen.
  assert.match(globe, /navigation\.navigate\('TripPlanner'\)/);

  // Lupa: mesma busca e mesmas constantes compartilhadas, não uma cópia local.
  assert.match(globe, /searchCountries/);
  assert.match(globe, /COUNTRY_SEARCH_DEBOUNCE_MS/);
  assert.match(globe, /MIN_COUNTRY_QUERY_LENGTH/);

  // Selecionar na busca move a câmera do globo e abre o país.
  assert.match(globe, /flyTo/);

  // Estatística: mesma conta e mesmo denominador da MapScreen (195 soberanos + 4
  // nações do Reino Unido). Números diferentes fariam as duas telas discordarem.
  assert.match(globe, /TOTAL_COUNTRIES = 199/);
  assert.match(globe, /visitedCount \/ TOTAL_COUNTRIES/);

  // Clique no território e no badge levam ao mesmo lugar.
  assert.match(globe, /onSelectCountry=\{handleSelectByCode\}/);
  assert.match(globe, /onSelect=\{openCountry\}/);
});

test('the globe does no layout work while the camera is moving', () => {
  // As travadas do arrasto vinham daqui: ler offsetWidth força o browser a
  // recalcular o layout na hora, e isso acontecia ~240 vezes por quadro, logo
  // depois de os 240 markers terem se mexido e invalidado tudo. A medição fica
  // pendente durante o gesto e é cobrada no fim.
  const markers = stripComments(read('src/components/map/CountryBadgeMarkers.web.js'));

  assert.match(markers, /isMoving\?\.\(\)/);
  assert.match(markers, /pendingMeasureRef/);
  // O flush tem de estar preso a eventos de FIM de movimento.
  assert.match(markers, /\['moveend', 'zoomend', 'idle'\]/);

  // Escrita em style dentro do laço por quadro só quando o valor muda.
  assert.match(markers, /if \(entry\.pointerEvents !== pointerEvents\)/);
  assert.match(markers, /if \(entry\.zIndex !== zIndex\)/);

  // O recálculo continua limitado a um por quadro.
  assert.match(markers, /requestAnimationFrame/);

  // Os badges se movem por transform a cada quadro; sem o aviso, o browser os
  // mantém na camada de pintura comum.
  assert.match(markers, /willChange = 'transform'/);
});

test('the globe fades in from a branded overlay instead of flashing', () => {
  const globeMap = stripComments(read('src/components/map/GlobeMap.web.js'));
  const config = stripComments(read('src/components/map/globeConfig.js'));

  // 'load' e não 'style.load': o segundo dispara com a esfera ainda sem textura.
  assert.match(globeMap, /map\.on\('load', handleLoad\)/);
  assert.match(globeMap, /opacity: ready \? 1 : 0/);
  assert.match(globeMap, /transition: `opacity \$\{FADE_MS\}ms/);
  assert.match(globeMap, /GlobeLoadingOverlay/);
  // Identidade visual: fundo Journi e o mesmo céu do mapa, para a transição ser
  // só a esfera surgindo.
  assert.match(globeMap, /#0D1326/);
  assert.match(globeMap, /STARFIELD_BACKGROUND_STYLE/);
  // Erro de tile não pode prender o overlay para sempre.
  assert.match(globeMap, /setReady\(true\)/);

  // Handshake com a Stadia adiantado para o import do módulo.
  assert.match(config, /rel = 'preconnect'/);
  assert.match(globeMap, /preconnectToStadia\(\)/);
});

test('client source sticks to APIs that exist on react-native-web', () => {
  // `Image.resolveAssetSource` só existe no react-native nativo. No web ele é
  // undefined, e a chamada estoura no CARREGAMENTO do módulo — tela branca, sem
  // erro de compilação para avisar antes. Assets se carregam pelo componente
  // <Image source={require(...)} />, que sabe lidar com cada plataforma.
  const files = ['src/components/map/GlobeMap.web.js', 'src/screens/map/GlobeScreen.js'];
  for (const file of files) {
    assert.doesNotMatch(stripComments(read(file)), /resolveAssetSource/, `${file} usa API nativa`);
  }
});
