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

test('client source is free of console calls and remote flag images', () => {
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
  assert.doesNotMatch(source, /console\.(log|debug|info|warn|error)\s*\(/);
  assert.doesNotMatch(source, /flagcdn\.com/);
});

test('README keeps JWT verification enabled for the AI function', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /functions deploy travel-assistant --no-verify-jwt/);
});
