import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  TouchableOpacity, View, ActivityIndicator,
  Modal, ScrollView, Text, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS } from '../utils/constants';
import { getCurrentUser, supabase } from '../services/supabase';
import { useUpload } from '../context/UploadContext';

// Screens
import ExploreScreen from '../screens/explore/ExploreScreen';
import FeedScreen from '../screens/feed/FeedScreen';
import MapScreen from '../screens/map/MapScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import UploadPlaceholder from '../screens/upload/UploadPlaceholder';
import PhotoUploader from '../components/PhotoUploader';
import PublicProfileScreen from '../screens/profile/PublicProfileScreen';
import AssistantResultScreen from '../screens/assistant/AssistantResultScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ConnectionsScreen from '../screens/profile/ConnectionsScreen';
import PhotoDetailScreen from '../screens/PhotoDetailScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ProfileStack() {
  return (
    <Stack.Navigator id="ProfileStack" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
    </Stack.Navigator>
  );
}

function TabNavigator() {
  const { openUploader } = useUpload();
  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#333',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          paddingBottom: 5,
          paddingTop: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarLabel: 'Mapa',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: 'Explorar',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="QuickUpload"
        component={UploadPlaceholder}
        options={{
          tabBarLabel: () => null,
          tabBarIcon: () => (
            <View style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: '#6C2BD9',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: -16,
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
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarLabel: 'Feed',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="newspaper-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const { visible, openUploader, closeUploader, notifyUploadComplete } = useUpload();
  const [detectedLocation, setDetectedLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const result = await getCurrentUser();

      if (result && result.id) {
        setUser(result);
      } else {
        setUser(null);
      }
      setLoading(false);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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

  if (loading) {
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
      <NavigationContainer>
        {!user ? (
          <Stack.Navigator id="AuthStack" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Navigator>
        ) : (
          <Stack.Navigator id="RootStack" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={TabNavigator} />
            <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
            <Stack.Screen name="PhotoDetail" component={PhotoDetailScreen} />
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
