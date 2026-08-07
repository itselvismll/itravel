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
  assert.match(handler, /responseSchema: planSchema/);
});

test('travel planner is personalized, structured, cancellable, and editable', () => {
  const assistant = read('src/services/assistantService.js');
  const planner = read('src/screens/assistant/TripPlannerScreen.js');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  const map = read('src/screens/map/MapScreen.js');
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
  assert.match(handler, /api\.frankfurter\.app/);
  assert.match(handler, /adjust_plan/);
  assert.match(result, /activity\.rating/);
  assert.match(result, /activity\.openingHours/);
});

test('travel planner masks Brazilian dates and sends ISO dates to the backend', () => {
  const planner = read('src/screens/assistant/TripPlannerScreen.js');
  const dateUtils = read('src/utils/dateUtils.js');
  const result = read('src/screens/assistant/AssistantResultScreen.js');
  assert.match(planner, /placeholder="DD\/MM\/AAAA"/);
  assert.match(planner, /maskBrazilianDate\(value, form\.startDate\)/);
  assert.match(planner, /startDate: toIsoDate\(form\.startDate\)/);
  assert.match(dateUtils, /digits\.length === 2/);
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

test('map refreshes visits after uploads and centers the chart label', () => {
  const map = read('src/screens/map/MapScreen.js');
  assert.match(map, /normalizeToAlpha2/);
  assert.match(map, /circleChartLabel/);
  assert.match(map, /justifyContent: 'center'/);
});

test('web map is constrained to one world without blank polar areas', () => {
  const map = read('src/screens/map/MapScreen.js');
  assert.match(map, /WEB_MERCATOR_LATITUDE_LIMIT/);
  assert.match(map, /maxBounds=\{WORLD_BOUNDS\}/);
  assert.match(map, /maxBoundsViscosity=\{1\}/);
  assert.match(map, /noWrap/);
  assert.match(map, /getMinimumWorldZoom/);
});

test('map resolves sovereign countries that arrive without ISO codes', () => {
  const geoCountryUtils = read('src/utils/geo-country-utils.js');
  const map = read('src/screens/map/MapScreen.js');
  assert.match(geoCountryUtils, /France: 'FRA'/);
  assert.match(geoCountryUtils, /Norway: 'NOR'/);
  assert.match(map, /getGeoCountryAlpha3\(feature\)/);
  assert.doesNotMatch(map, /countryCode === '-99'/);
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
  assert.match(notifications, /item\.type === 'comment' && item\.photo_id/);
  assert.match(notifications, /navigation\.navigate\('PhotoDetail'/);
  assert.match(notifications, /photo\.photo_url/);
  assert.match(navigation, /name="PhotoDetail"/);
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
