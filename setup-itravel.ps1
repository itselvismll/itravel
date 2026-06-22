# Script para criar estrutura completa do iTravel
# Execute no PowerShell do VS Code

Write-Host "Criando estrutura do iTravel..." -ForegroundColor Green

# Criar estrutura de pastas
$folders = @(
    "src\components\common",
    "src\components\post",
    "src\components\map",
    "src\components\message",
    "src\screens\auth",
    "src\screens\feed",
    "src\screens\explore",
    "src\screens\map",
    "src\screens\post",
    "src\screens\profile",
    "src\screens\messages",
    "src\navigation",
    "src\services",
    "src\hooks",
    "src\store",
    "src\utils",
    "src\assets\images",
    "src\assets\icons"
)

foreach ($folder in $folders) {
    New-Item -ItemType Directory -Path $folder -Force | Out-Null
}

Write-Host "Pastas criadas!" -ForegroundColor Green

# Criar constants.js
@"
// Cores do tema iTravel
export const COLORS = {
  primary: '#FF5722',
  primaryLight: '#FF8A65',
  primaryDark: '#E64A19',
  white: '#FFFFFF',
  black: '#000000',
  gray: '#666666',
  lightGray: '#E5E5E5',
  background: '#FAFAFA',
  text: '#2C3E50',
  textSecondary: '#999999',
  border: '#F0F0F0',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FFC107',
};

export const SIZES = {
  base: 8,
  font: 14,
  radius: 12,
  padding: 16,
  margin: 16,
  h1: 36,
  h2: 28,
  h3: 22,
  h4: 18,
  body: 14,
  small: 12,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const API_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  GOOGLE_MAPS_API_KEY: '',
};

export const LIMITS = {
  MAX_PHOTOS_PER_POST: 10,
  STORY_DURATION_HOURS: 24,
  MAX_BIO_LENGTH: 150,
  MAX_CAPTION_LENGTH: 500,
};
"@ | Out-File -FilePath "src\utils\constants.js" -Encoding utf8

# Criar FeedScreen.js
@"
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SIZES } from '../../utils/constants';

export default function FeedScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>iTravel</Text>
      </View>
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Feed</Text>
        <Text style={styles.subtitle}>Em breve: posts de viagens dos seus amigos! 🌍</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.lightGray },
  logo: { fontSize: 22, fontWeight: '600', color: COLORS.primary },
  content: { flex: 1, padding: 16 },
  title: { fontSize: SIZES.h2, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  subtitle: { fontSize: SIZES.body, color: COLORS.gray },
});
"@ | Out-File -FilePath "src\screens\feed\FeedScreen.js" -Encoding utf8

# Criar ExploreScreen.js
@"
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../../utils/constants';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Explorar</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.subtitle}>Descubra novos viajantes e destinos! 🔍</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.lightGray },
  title: { fontSize: SIZES.h3, fontWeight: '600', color: COLORS.text },
  content: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' },
  subtitle: { fontSize: SIZES.body, color: COLORS.gray, textAlign: 'center' },
});
"@ | Out-File -FilePath "src\screens\explore\ExploreScreen.js" -Encoding utf8

# Criar MapScreen.js
@"
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../../utils/constants';

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Meu Mapa</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.emoji}>🗺️</Text>
        <Text style={styles.subtitle}>Mapa-múndi interativo em breve!</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.lightGray },
  title: { fontSize: SIZES.h3, fontWeight: '600', color: COLORS.text },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  emoji: { fontSize: 64, marginBottom: 16 },
  subtitle: { fontSize: SIZES.body, color: COLORS.gray },
});
"@ | Out-File -FilePath "src\screens\map\MapScreen.js" -Encoding utf8

# Criar ProfileScreen.js
@"
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../../utils/constants';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Perfil</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.emoji}>👤</Text>
        <Text style={styles.subtitle}>Seu perfil de viajante em breve!</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.lightGray },
  title: { fontSize: SIZES.h3, fontWeight: '600', color: COLORS.text },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  emoji: { fontSize: 64, marginBottom: 16 },
  subtitle: { fontSize: SIZES.body, color: COLORS.gray },
});
"@ | Out-File -FilePath "src\screens\profile\ProfileScreen.js" -Encoding utf8

# Criar NotificationsScreen.js
@"
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SIZES } from '../utils/constants';

export default function NotificationsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notificações</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.subtitle}>Suas notificações aparecerão aqui! 🔔</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: COLORS.lightGray },
  title: { fontSize: SIZES.h3, fontWeight: '600', color: COLORS.text },
  content: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center' },
  subtitle: { fontSize: SIZES.body, color: COLORS.gray },
});
"@ | Out-File -FilePath "src\screens\NotificationsScreen.js" -Encoding utf8

# Criar AppNavigator.js
@"
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../utils/constants';

import FeedScreen from '../screens/feed/FeedScreen';
import ExploreScreen from '../screens/explore/ExploreScreen';
import MapScreen from '../screens/map/MapScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.gray,
          tabBarShowLabel: false,
        }}
      >
        <Tab.Screen
          name="Feed"
          component={FeedScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Ionicons name="home" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Explore"
          component={ExploreScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Ionicons name="compass" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{
            tabBarIcon: () => (
              <View style={styles.mapButton}>
                <Ionicons name="map" size={28} color="#FFF" />
              </View>
            ),
          }}
        />
        <Tab.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Ionicons name="notifications" size={26} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Ionicons name="person" size={26} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 70,
    paddingBottom: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.lightGray,
    backgroundColor: COLORS.white,
  },
  mapButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
});
"@ | Out-File -FilePath "src\navigation\AppNavigator.js" -Encoding utf8

Write-Host "Todos os arquivos criados com sucesso!" -ForegroundColor Green
Write-Host "Agora atualize o App.js e rode npm start!" -ForegroundColor Yellow
