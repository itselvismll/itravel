const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Supabase configuration is environment-only', () => {
  const constants = read('src/utils/constants.js');
  assert.doesNotMatch(constants, /SUPABASE_ANON_KEY:\s*process\.env[^\n]+\|\|/);
  assert.match(constants, /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(constants, /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
});

test('AI function validates authentication and destination input', () => {
  const handler = read('supabase/functions/travel-assistant/index.ts');
  assert.match(handler, /Authorization/);
  assert.match(handler, /Destino inv/);
  assert.match(handler, /gemini-3\.6-flash/);
  assert.doesNotMatch(handler, /gemini-1\.5-flash/);
  assert.doesNotMatch(handler, /temperature:/);
});

test('travel assistant exposes every prompt and handles session, timeout, and inline errors', () => {
  const assistant = read('src/services/assistantService.js');
  const map = read('src/screens/map/MapScreen.js');
  for (const promptType of ['guide', 'itinerary', 'budget', 'weather', 'scams', 'summary']) {
    assert.match(assistant, new RegExp(`id: '${promptType}'`));
  }
  assert.match(assistant, /refreshSession/);
  assert.match(assistant, /AbortController/);
  assert.match(map, /handleGenerateAssistant/);
  assert.match(map, /assistantErrorText/);
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

test('profile updates create a missing profile row and comments return inserted data', () => {
  const profileService = read('src/services/profileService.js');
  const socialService = read('src/services/socialService.js');
  assert.match(profileService, /\.upsert\(/);
  assert.match(profileService, /supabase\.auth\.updateUser/);
  assert.match(socialService, /profiles!comments_user_id_fkey/);
  assert.match(socialService, /\.single\(\)/);
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
  const source = files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  const countryFlag = read('src/components/CountryFlag.js');
  assert.doesNotMatch(source, /console\.(log|debug|info|warn|error)\s*\(/);
  assert.match(countryFlag, /flagcdn\.com/);
  assert.match(countryFlag, /cache: 'force-cache'/);
  assert.equal((source.match(/flagcdn\.com/g) || []).length, 1);
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

test('README keeps JWT verification enabled for the AI function', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /functions deploy travel-assistant --no-verify-jwt/);
});
