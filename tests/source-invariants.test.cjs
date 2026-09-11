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
  assert.doesNotMatch(assistant, /createLocalPreviewPlan/);
  assert.doesNotMatch(assistant, /Prévia local do novo planejador/);
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
  assert.match(handler, /getJourneyLiveContext/);
  assert.match(handler, /destinations\.map/);
  assert.match(handler, /principais pontos turísticos/);
  assert.match(handler, /capitalInfo/);
  assert.match(handler, /overpass\.kumi\.systems/);
  assert.match(handler, /addExactMapLinks/);
  assert.match(handler, /google\.com\/maps\/search/);
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
  assert.match(authService, /options:\s*\{[\s\S]*?data:\s*\{/);
  assert.match(migration, /after insert on auth\.users/);
  assert.match(migration, /security definer/);
});

test('email/password auth sends an hCaptcha token to Supabase', () => {
  const authService = read('src/services/supabase.js');
  assert.match(authService, /signInWithPassword\(\{[\s\S]*?options:\s*\{\s*captchaToken\s*\}/);
  assert.match(authService, /signUp\(\{[\s\S]*?captchaToken,/);

  // Um widget por plataforma: inline na web, WebView em modal no nativo.
  assert.match(read('src/components/auth/HCaptchaWidget.web.js'), /@hcaptcha\/react-hcaptcha/);
  assert.match(read('src/components/auth/HCaptchaWidget.js'), /@hcaptcha\/react-native-hcaptcha/);
  assert.match(read('src/utils/constants.js'), /EXPO_PUBLIC_HCAPTCHA_SITE_KEY/);

  // Token e de uso unico: submit bloqueado sem ele e widget resetado no erro.
  for (const screen of ['src/screens/auth/LoginScreen.js', 'src/screens/auth/RegisterScreen.js']) {
    const source = read(screen);
    assert.match(source, /const submitDisabled = loading \|\| \(HCAPTCHA_ENABLED && !captchaToken\);/);
    assert.match(source, /captchaRef\.current\?\.reset\(\);/);
    assert.match(source, /disabled=\{submitDisabled\}/);
  }
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
  // estatística virou o pill de países visitados — os dados são os mesmos.
  const status = read('src/components/map/countryStatus.js');
  const globe = stripComments(read('src/screens/map/GlobeScreen.js'));
  assert.match(status, /getAlpha3/);
  assert.match(status, /toAlpha3Set/);
  assert.match(globe, /visitedCount = visited\.size/);
  assert.match(globe, /styles\.visitedPill/);
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

test('Android renders the interactive globe instead of the country-list fallback', () => {
  const screen = stripComments(read('src/screens/map/GlobeScreen.js'));
  const nativeGlobe = stripComments(read('src/components/map/NativeGlobe.dom.js'));

  assert.match(nativeGlobe, /^\s*['"]use dom['"]/);
  assert.match(nativeGlobe, /<GlobeMap/);
  assert.match(nativeGlobe, /<CountryFillLayer/);
  assert.match(nativeGlobe, /<CountryBadgeMarkers/);
  assert.match(nativeGlobe, /onSelectCountry/);
  assert.match(screen, /<NativeGlobe/);
  assert.doesNotMatch(screen, /styles\.nativeList/);
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
  assert.match(auth, /window\.location\?\.origin[\s\S]*?:\s*API_CONFIG\.WEB_APP_URL/);

  // O code do PKCE e de uso unico: quem o troca por sessao e o detectSessionInUrl
  // do client, e mais ninguem. Uma segunda troca manual aqui fazia as duas
  // competirem pelo mesmo code e derrubava o login com Google.
  const webCallback = auth.slice(
    auth.indexOf('export async function completeWebOAuthSession'),
    auth.indexOf('const getPasswordRecoveryRedirectUrl')
  );
  assert.match(auth, /detectSessionInUrl: true/);
  assert.doesNotMatch(stripComments(webCallback), /exchangeCodeForSession/);
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
  const filesWithConsole = files
    .filter(file => /console\.(log|debug|info|warn|error)\s*\(/.test(stripComments(fs.readFileSync(file, 'utf8'))))
    .map(file => path.relative(root, file).split(path.sep).join('/'));
  // Os ÚNICOS dois arquivos com direito a console — e, nos dois, só `console.error`.
  //
  // O ScreenErrorBoundary está aqui porque é a última parada de um erro que já
  // derrubou uma tela: sem o console, a mensagem de erro morreria com ele e o
  // que sobraria seria uma tela de "algo deu errado" sem rastro nenhum para
  // diagnosticar — pior do que a tela em branco que ele veio substituir.
  const CONSOLE_ALLOWLIST = [
    'src/components/ScreenErrorBoundary.js',
    'src/navigation/AppNavigator.js',
  ];
  assert.deepEqual(filesWithConsole, CONSOLE_ALLOWLIST);
  for (const file of CONSOLE_ALLOWLIST) {
    assert.doesNotMatch(stripComments(read(file)), /console\.(log|debug|info|warn)\s*\(/, file);
  }
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
  // A etiqueta de bagagem do passaporte saiu do ProfileScreen e virou o
  // CountryTag, compartilhado com o Quero Visitar, o perfil público e o modal da
  // lista completa. O que este invariante protege continua o mesmo — o
  // passaporte não volta a ser uma lista de bandeiras soltas —, só mudou de
  // arquivo junto com a marcação.
  const countryTag = read('src/components/profile/CountryTag.js');
  assert.match(countryTag, /tagCountryMark/);
  assert.match(countryTag, /<CountryFlag/);
  assert.match(profile, /<CountryGridSection/);
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
  // Cápsula flutuante: raio = metade da altura, derivado e não escrito à mão,
  // para mudar a altura não deixar a barra com cantos meio arredondados.
  assert.match(navigator, /borderRadius: TAB_BAR_HEIGHT \/ 2/);
  assert.match(navigator, /position: 'absolute'/);

  // A pílula do item ativo precisa de um tabBarButton próprio. O
  // `tabBarActiveBackgroundColor` do bottom-tabs v7 é pintado no pressable de
  // dentro, cujo borderRadius é fixo em 0 na variante padrão, e o
  // `tabBarItemStyle` só alcança o View de fora — sem este botão, o fundo do
  // item ativo volta a ser um retângulo de canto vivo dentro de um menu redondo.
  assert.match(navigator, /tabBarButton: \(props\) => <TabBarButton/);
  assert.match(navigator, /borderRadius: TAB_ITEM_RADIUS/);
  // E o "+" não pode recortar: ele sobe além do item de propósito.
  assert.match(navigator, /<TabBarButton \{\.\.\.props\} clip=\{false\} \/>/);
  assert.match(navigator, /overflow: clip \? 'hidden' : 'visible'/);
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
  assert.match(assistant, /const strictDaySchemaLimit = 3/);
  assert.match(assistant, /Math\.ceil\(duration \/ strictDaySchemaLimit\)/);
  assert.match(assistant, /Math\.min\(strictDaySchemaLimit, duration - index \* strictDaySchemaLimit\)/);
  assert.match(assistant, /spec\.days <= strictDaySchemaLimit/);
  assert.match(assistant, /minItems: spec\.days, maxItems: spec\.days/);
  assert.match(assistant, /Math\.min\(65535, Math\.max\(8192, spec\.days \* 1000\)\)/);
  assert.match(assistant, /candidatePlan\.days\.length === spec\.days/);
  assert.match(assistant, /retorne somente o campo days/);
  assert.match(assistant, /const chunkConcurrency = 1/);
  assert.match(assistant, /Promise\.all\(/);
  assert.match(assistant, /gemini-3\.5-flash-lite/);
  assert.match(assistant, /AbortSignal\.timeout\(28000\)/);
  assert.match(assistant, /const aiContext =/);
  assert.match(assistant, /placeNames:/);
  assert.match(assistant, /dayDestinations:/);
  assert.match(assistant, /Siga dayDestinations exatamente/);
  assert.match(assistant, /const maxProviderAttempts = 2/);
  assert.match(assistant, /getProviderRetryDelayMs/);
  assert.match(assistant, /geminiResponse\.status === 429/);
  assert.match(assistant, /model !== models\[models\.length - 1\]/);
  assert.match(assistant, /await sleep\(1200\)/);
  assert.match(assistant, /placeWindowSize/);
  assert.match(service, /activeAssistantRequests/);
  assert.match(assistant, /const usedActivityTitles = new Set/);
  assert.match(assistant, /Locais já usados em blocos anteriores/);
  assert.match(assistant, /Cada atividade deve citar pelo nome um lugar real e identificável/);
  assert.match(assistant, /Não use títulos genéricos/);
  assert.match(service, /requestedDuration \* 10000/);
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
  assert.match(currency, /world-countries@latest\/dist\/countries\.json/);
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
  // A inscrição é desfeita na limpeza do efeito. O `removeChannel` direto saiu
  // daqui quando o canal passou a ser aberto por openPostgresChangesChannel
  // (services/realtimeChannel.js), que devolve a própria função de limpeza — é
  // ela que precisa ser chamada, junto com o `cancelled` que barra o enqueue em
  // voo.
  assert.match(banner, /const closeChannel = openPostgresChangesChannel\(\{/);
  assert.match(banner, /cancelled = true;\s*\n\s*closeChannel\(\);/);

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
  assert.match(assistant, /'hotel', 5\),/);
  // O chat continua ouvindo INSERT em `messages` em tempo real. O literal
  // 'postgres_changes' saiu daqui quando a inscrição passou a ir por
  // openPostgresChangesChannel (services/realtimeChannel.js) — o que se checa
  // agora é a inscrição pelo helper e a tabela que ela escuta.
  assert.match(conversation, /openPostgresChangesChannel\(\{/);
  assert.match(conversation, /table: 'messages'/);
  assert.match(conversation, /conversation_id=eq\.\$\{conversationId\}/);
  assert.match(realtime, /supabase_realtime add table public\.messages/);
  assert.match(passport, /<ShareCard/);
  assert.match(profile, /Seguir de volta/);
});

test('map, currencies, and social notifications do not depend on partial providers', () => {
  const globeConfig = read('src/components/map/globeConfig.js');
  const currency = read('src/services/currencyService.js');
  const notifications = read('src/screens/NotificationsScreen.js');
  const feed = read('src/screens/feed/FeedScreen.js');
  const banner = read('src/components/GlobalNotificationBanner.js');
  const socialTypes = read('src/utils/socialNotifications.js');
  const migration = read('supabase/migrations/20260812130000_social_notifications_only.sql');

  // O globo é satélite (Alidade Satellite): o terreno real é o que faz a pintura
  // roxa/branca ler como território. Uma style vetorial deixa o globo chapado —
  // já aconteceu uma vez, ao trocar por OpenFreeMap Liberty para fugir do 401.
  // O caminho para o 401 é cadastrar o domínio na Stadia / publicar a key, não
  // trocar a style.
  assert.match(globeConfig, /tiles\.stadiamaps\.com\/styles\/\$\{STADIA_STYLE_ID\}\.json/);
  assert.match(globeConfig, /alidade_satellite/);
  assert.doesNotMatch(globeConfig, /openfreemap/i);

  // A FOTO, porém, vem do Mapbox: o plano Stadia Starter não serve satélite fora
  // de localhost, e em produção cada tile de /data/imagery/ voltava 403 — globo
  // sem imagem nenhuma. A style continua a da Stadia; só a source `imagery` é
  // trocada, dentro do loadGlobeStyle.
  assert.match(globeConfig, /MAPBOX_ORIGIN = .https:\/\/api\.mapbox\.com./);
  assert.match(
    globeConfig,
    /\$\{MAPBOX_ORIGIN\}\/v4\/\$\{MAPBOX_SATELLITE_TILESET\}\/\{z\}\/\{x\}\/\{y\}@2x\.jpg90/
  );
  assert.match(globeConfig, /MAPBOX_SATELLITE_TILESET = 'mapbox\.satellite'/);
  // O `@2x` e o `tileSize: 512` são um PAR, e é isso que este teste trava: o @2x
  // é a variante do endpoint que devolve um tile de 512 de verdade. Declarar 512
  // sem o @2x faz o MapLibre esticar uma imagem de 256 e o globo sai borrado;
  // usar @2x declarando 256 desperdiça metade dos pixels baixados. Mexer em um
  // sem o outro é o erro que dá para cometer sem perceber.
  assert.match(globeConfig, /tileSize: 512/);
  // A troca acontece ANTES de o mapa nascer: depois do style.load os tiles da
  // Stadia já teriam saído, e com eles os 403 que a migração veio resolver.
  assert.match(globeConfig, /copy\.sources\[IMAGERY_SOURCE_ID\] = \{ \.\.\.MAPBOX_SATELLITE_SOURCE \}/);
  assert.match(currency, /@fawazahmed0\/currency-api@latest/);
  assert.match(currency, /world-countries@latest\/dist\/countries\.json/);
  assert.match(currency, /open\.er-api\.com\/v6\/latest/);
  assert.match(currency, /api\.frankfurter\.dev\/v2\/rate/);
  assert.match(socialTypes, /\['follow', 'comment', 'like'\]/);
  assert.match(notifications, /\.in\('type', SOCIAL_NOTIFICATION_TYPES\)/);
  assert.match(feed, /\.in\('type', SOCIAL_NOTIFICATION_TYPES\)/);
  assert.match(banner, /isSocialNotification\(row\)/);
  assert.match(migration, /drop trigger if exists on_message_created_notify/);
  assert.match(migration, /delete from public\.notifications where type in \('message', 'passport'\)/);
  assert.match(migration, /sync_photo_like_notification/);
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

  // Estatística: o pill conta os visitados de verdade sobre o total de países
  // que o próprio globo desenha — nada de denominador escrito à mão, que
  // discordaria da lista assim que ela mudasse. O 199 sobrou só como valor de
  // partida enquanto o GeoJSON não chegou.
  assert.match(globe, /TOTAL_COUNTRIES = 199/);
  assert.match(globe, /countries\.length \|\| TOTAL_COUNTRIES/);

  // O pill fica no canto inferior direito, acima da tab bar. Os dois termos são
  // necessários e por motivos diferentes: TAB_BAR_CLEARANCE tira o pill de
  // debaixo da barra flutuante (que é absoluta e não reserva espaço nenhum), e o
  // inset o afasta da barra de gestos nos aparelhos que a têm. Com só 16 de
  // `bottom`, como já esteve, o pill nascia atrás da tab bar.
  assert.match(globe, /useSafeAreaInsets/);
  assert.match(globe, /bottom: TAB_BAR_CLEARANCE \+ insets\.bottom/);

  // Clique no território e no badge levam ao mesmo lugar.
  assert.match(globe, /onSelectCountry=\{handleSelectByCode\}/);
  assert.match(globe, /onSelect=\{openCountry\}/);
});

test('the bottom-right corner of the globe belongs to the visited pill alone', () => {
  // Os botões + / − do MapLibre nasciam em bottom-right e ficavam escondidos
  // atrás do pill de países visitados. Num app de toque eles são redundantes
  // (scroll e pinça já dão zoom), então saíram; o GlobeControl foi para o canto
  // do crédito. Se algum control voltar para bottom-right o pill volta a cobri-lo.
  const map = stripComments(read('src/components/map/GlobeMap.web.js'));
  assert.doesNotMatch(map, /NavigationControl/);
  assert.doesNotMatch(map, /'bottom-right'/);
  assert.match(map, /new GlobeControl\(\), 'bottom-left'/);
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

  // Handshake com os provedores de tiles adiantado para o import do módulo. São
  // dois hosts: a style vem da Stadia e a foto de satélite do Mapbox.
  assert.match(config, /rel = 'preconnect'/);
  assert.match(config, /tiles\.stadiamaps\.com/);
  assert.match(config, /api\.mapbox\.com/);
  assert.match(globeMap, /preconnectToTileHosts\(\)/);
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

test('map attribution stays present but starts collapsed', () => {
  const config = stripComments(read('src/components/map/globeConfig.js'));
  const globeMap = stripComments(read('src/components/map/GlobeMap.web.js'));
  const onboardingGlobe = stripComments(read('src/components/onboarding/OnboardingGlobe.web.js'));

  // O crédito da Stadia/OSM/Mapbox é exigência de licença: ele não pode sumir, só
  // começar fechado. Trocado o provedor da imagem, o crédito dela troca junto —
  // creditar a Airbus por uma foto do Mapbox seria atribuição errada.
  assert.match(config, /SATELLITE_IMAGERY_ATTRIBUTION/);
  const attribution = config.split('export const SATELLITE_IMAGERY_ATTRIBUTION')[1] ?? '';
  assert.match(attribution, /mapbox\.com/);
  assert.match(attribution, /maxar\.com/);
  for (const source of [globeMap, onboardingGlobe]) {
    assert.match(source, /new AttributionControl\(\{\s*compact: true/);
    assert.match(source, /customAttribution: SATELLITE_IMAGERY_ATTRIBUTION/);
    // `compact: true` dá o formato; o estado inicial recolhido é esta chamada.
    assert.match(source, /collapseAttributionOnce\(map\)/);
    assert.match(source, /releaseAttribution\(\)/);
  }

  // A remoção da classe de expandido é de uma vez só. Um listener permanente
  // fecharia o painel na cara de quem acabou de clicar no ⓘ.
  assert.match(config, /maplibregl-compact-show/);
  assert.match(config, /done = true;\s*detach\(\);/);
});

test('the guided onboarding card closes on the first marked country', () => {
  const globe = stripComments(read('src/screens/map/GlobeScreen.js'));

  // A marcação continua sendo a do CountryDetailModal: o que a tela faz é
  // ESCUTAR o resultado dela. Passar o `applyVisitedChange` cru para o modal
  // seria a regressão — o passo guiado ficaria sem gatilho nenhum.
  assert.match(globe, /onVisitedChange=\{handleVisitedChange\}/);
  assert.doesNotMatch(globe, /onVisitedChange=\{applyVisitedChange\}/);

  // Marcar o país precisa fechar o card, fechar o modal, celebrar e encerrar o
  // onboarding — os quatro.
  const handler = globe.slice(globe.indexOf('const handleVisitedChange'));
  assert.match(handler, /setGuidedDismissed\(true\)/);
  assert.match(handler, /setModalVisible\(false\)/);
  assert.match(handler, /setCelebration\(/);
  assert.match(handler, /finishOnboarding\(\)/);

  // O card sai pelo estado local, não esperando o `guidedActive` dar a volta
  // pelo contexto depois de uma gravação assíncrona.
  assert.match(globe, /showGuidedCard = guidedActive && !guidedDismissed/);
  assert.match(globe, /\{showGuidedCard && \(/);

  // O alerta bloqueante do navegador fica suprimido no passo guiado: ele
  // engoliria a celebração inteira.
  assert.match(globe, /suppressVisitedAlert=\{guidedActive\}/);
});

test('mobile performance safeguards keep heavy content bounded', () => {
  const feed = stripComments(read('src/screens/feed/FeedScreen.js'));
  const followService = stripComments(read('src/services/followService.js'));
  const explore = stripComments(read('src/screens/explore/ExploreScreen.js'));
  const globe = stripComments(read('src/screens/map/GlobeScreen.js'));
  const nativeGlobe = stripComments(read('src/components/map/NativeGlobe.dom.js'));
  const globeMap = stripComments(read('src/components/map/GlobeMap.web.js'));

  assert.match(feed, /<FlatList/);
  assert.doesNotMatch(feed, /feed\.map\(/);
  assert.match(feed, /FEED_PAGE_SIZE = 12/);
  assert.match(feed, /cachePolicy="memory-disk"/);
  assert.match(followService, /\.range\(from, from \+ pageSize - 1\)/);

  assert.match(explore, /\.limit\(80\)/);
  assert.match(explore, /<CachedImage/);
  assert.match(explore, /data=\{countryPhotos\}/);

  assert.match(globe, /useIsFocused/);
  assert.match(globe, /isFocused \? \(/);
  assert.match(nativeGlobe, /performanceMode/);
  assert.match(globeMap, /pixelRatio: performanceMode \? 1 : undefined/);
  assert.match(globeMap, /maxTileCacheSize: performanceMode \? 48 : null/);
});

test('the itinerary layer is optional, isolated and drawn by GL layers', () => {
  const globe = stripComments(read('src/screens/map/GlobeScreen.js'));
  const layer = stripComments(read('src/components/map/PlanRouteLayer.web.js'));
  const route = stripComments(read('src/components/map/planRoute.js'));

  assert.match(globe, /<PlanRouteLayer\s+map=\{map\}\s+points=\{planPoints\}\s+planId=\{activePlanId\}/);
  assert.match(globe, /useActivePlan\(\)/);

  // O controle de aplicar/remover mora na tela de roteiros salvos: o globo nao
  // ganha botao nem card sobreposto de roteiro.
  assert.doesNotMatch(globe, /applyToMap|removeFromMap/);

  // Sem roteiro ativo nenhuma layer e criada — o globo fica identico ao de antes
  // da feature. E o que `hasPoints` guarda nos dois efeitos de montagem.
  assert.match(layer, /const hasPoints = Boolean\(points\?\.length\)/);
  assert.match(layer, /if \(!map \|\| !hasPoints\) return undefined;/);
  assert.match(layer, /detachPlanRouteLayers\(map\)/);

  // O modulo puro conversa com o mapa so por metodos publicos: nada de importar
  // maplibre-gl, senao ele deixa de rodar no teste sem browser.
  assert.doesNotMatch(route, /from 'maplibre-gl'/);

  // Roteiro trocado repinta os dados; nada de recriar layer a cada aplicacao.
  assert.match(layer, /updatePlanRouteData\(map, data\)/);

  // Enquadramento pelo conjunto dos pontos, com flyTo so no roteiro de um ponto.
  assert.match(layer, /map\.fitBounds\(bounds/);
  assert.match(layer, /map\.flyTo\(\{ center: \[west, south\]/);
});

test('only one itinerary can be applied to the globe at a time', () => {
  const migration = read('supabase/migrations/20260901120000_travel_plans_active_on_map.sql');
  const service = stripComments(read('src/services/activePlanService.js'));
  const screen = stripComments(read('src/screens/assistant/SavedTripsScreen.js'));

  // Quem garante "um por usuario" e o banco, nao a UI.
  assert.match(migration, /create unique index if not exists travel_plans_one_active_on_map_idx/);
  assert.match(migration, /where is_active_on_map/);
  // A troca e atomica: com duas instrucoes separadas o indice unico rejeitaria o
  // instante com dois roteiros ativos.
  assert.match(migration, /create or replace function public\.set_active_plan_on_map/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /user_id = auth\.uid\(\)/);

  // Roteiro local_only tambem pode ser aplicado, pelo localStorage — e as duas
  // origens sao exclusivas entre si.
  assert.match(service, /journi\.activePlanOnMap/);
  assert.match(service, /isLocalPlanId/);
  assert.match(service, /setRemoteActivePlan\(null\)/);

  // O marcador visual e o toggle vivem na tela de roteiros salvos.
  assert.match(screen, /Aplicar no mapa/);
  assert.match(screen, /Remover do mapa/);
  assert.match(screen, /Ativo no mapa/);
  assert.match(screen, /plan\.id === activePlanId/);
});

test('todo peso de Poppins usado no app está carregado no useFonts', () => {
  // Peso ausente do useFonts não dá erro: o React Native não acha a família,
  // cai na fonte do sistema e o texto sai com um peso parecido o bastante para
  // ninguém notar. Foi assim que o Poppins_600SemiBold ficou em 5 arquivos sem
  // nunca ser carregado.
  const app = read('App.js');

  // Só o que está DENTRO do useFonts({...}) conta. Varrer o arquivo inteiro
  // deixaria passar o peso que foi importado mas esquecido na chamada — que é
  // o mesmo bug, só que mais difícil de ver.
  const useFontsCall = app.match(/useFonts\(\{([\s\S]*?)\}\)/);
  assert.ok(useFontsCall, 'não achei a chamada de useFonts no App.js');
  const loaded = new Set(
    [...useFontsCall[1].matchAll(/\bPoppins_(\w+)\b/g)].map(match => `Poppins_${match[1]}`)
  );

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

  const missing = new Map();
  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of source.matchAll(/fontFamily:\s*'(Poppins_\w+)'/g)) {
      if (loaded.has(match[1])) continue;
      const relative = path.relative(root, file).split(path.sep).join('/');
      missing.set(match[1], [...(missing.get(match[1]) ?? []), relative]);
    }
  }

  assert.deepEqual(
    [...missing.entries()],
    [],
    'pesos usados mas não carregados no useFonts do App.js'
  );
});

test('os dois botões de marcação do país têm a mesma forma e diferem só na cor', () => {
  const modal = read('src/components/map/CountryDetailModal.js');

  // Os dois saem da MESMA base de forma. Se um deles voltar a ter estilo inline
  // ou estilo próprio, é aqui que quebra.
  const usesSharedShape = [...modal.matchAll(/style=\{\[styles\.actionBtn, /g)];
  assert.equal(usesSharedShape.length, 2, 'os dois botões precisam partir de styles.actionBtn');

  // A forma mora num lugar só, e as variações são apenas de cor: nada de
  // padding, raio ou borda dentro dos modificadores.
  const shapeKeys = ['borderRadius', 'paddingVertical', 'paddingHorizontal', 'borderWidth'];
  const modifiers = [
    'actionBtnVisitedOff',
    'actionBtnVisitedOn',
    'actionBtnWishOff',
    'actionBtnWishOn',
  ];
  for (const name of modifiers) {
    const block = modal.match(new RegExp(name + ':\\s*\\{([^}]*)\\}'));
    assert.ok(block, `não achei o estilo ${name}`);
    for (const key of shapeKeys) {
      assert.doesNotMatch(block[1], new RegExp(key), `${name} não pode redefinir ${key}`);
    }
    // Só cor: fundo e borda.
    assert.match(block[1], /backgroundColor|borderColor/, `${name} deveria definir cor`);
  }

  // Sem ícone nem emoji em nenhum dos dois: o estado é comunicado pelo
  // preenchimento, não por um "✓" nem por um Ionicons dentro do botão.
  assert.doesNotMatch(modal, /Já visitei ✓/);
  assert.doesNotMatch(modal, /Na wishlist ✓/);
  assert.match(modal, /\{isVisited \? 'Já visitei' : 'Marcar como visitado'\}/);
  assert.match(modal, /\{isWishlisted \? 'Na wishlist' : 'Quero visitar'\}/);
});

test('toda tela sob a tab bar reserva folga no fim do conteúdo', () => {
  // A tab bar é `position: absolute` e flutua SOBRE o conteúdo, sem reservar
  // espaço no layout (ver utils/tabBarLayout). Uma lista que termina no fim da
  // tela termina atrás dela, e o último item fica invisível e sem receber toque
  // — era o caso do botão "Seguir" no fim da tela Explorar.
  //
  // Antes desta correção cada tela chutava um número: 96 no Feed, 56 no Support,
  // 50 nos roteiros salvos, 32 no Perfil, 20 no Explorar. Só o 96 chegava perto.
  const hook = read('src/hooks/useTabBarContentPadding.js');
  assert.match(hook, /TAB_BAR_CLEARANCE \+ insets\.bottom/);
  // Devolve 0 fora das tabs: a SupportScreen também vive no AuthStack, onde não
  // há barra e a folga viraria um vão morto.
  assert.match(hook, /if \(!hasTabBar\) return 0;/);
  assert.match(hook, /getParent\(TAB_NAVIGATOR_ID\)/);
  // O id precisa bater com o do Tab.Navigator, senão o hook devolve 0 em todo lugar.
  assert.match(hook, /TAB_NAVIGATOR_ID = 'MainTabs'/);
  assert.match(read('src/navigation/AppNavigator.js'), /<Tab\.Navigator\s*\n\s*id="MainTabs"/);

  // As telas que ficam DENTRO do TabNavigator e têm conteúdo rolável. O globo
  // não entra: ele não rola, e os controles ancorados no rodapé dele já somam
  // TAB_BAR_CLEARANCE por conta própria.
  const screensUnderTabs = [
    'src/screens/explore/ExploreScreen.js',
    'src/screens/feed/FeedScreen.js',
    'src/screens/profile/ProfileScreen.js',
    'src/screens/profile/EditProfileScreen.js',
    'src/screens/assistant/SavedTripsScreen.js',
    'src/screens/support/SupportScreen.js',
  ];
  for (const screen of screensUnderTabs) {
    assert.match(read(screen), /useTabBarContentPadding/, `${screen} não reserva folga da tab bar`);
  }

  // A folga do Feed NÃO pode voltar para o ListFooterComponent: como footer ela
  // sumia quando `loadingMore` trocava o espaçador pelo spinner, e o indicador
  // de "carregando mais" ficava atrás da barra.
  const feed = read('src/screens/feed/FeedScreen.js');
  assert.match(feed, /contentContainerStyle=\{\[styles\.body, \{ paddingBottom: tabBarPadding \}\]\}/);
  assert.doesNotMatch(stripComments(feed), /<View style=\{\{ height: 96 \}\} \/>/);
});
