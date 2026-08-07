import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useFonts, Poppins_700Bold, Poppins_400Regular, Poppins_300Light } from '@expo-google-fonts/poppins';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UploadProvider } from './src/context/UploadContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const [fontsLoaded] = useFonts({ Poppins_700Bold, Poppins_400Regular, Poppins_300Light });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1326', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6C2BD9" />
      </View>
    );
  }

  // SafeAreaProvider é o que dá o inset do topo ao banner global de notificações, para
  // ele não nascer embaixo do notch/status bar.
  return (
    <SafeAreaProvider>
      <UploadProvider>
        <AppNavigator />
      </UploadProvider>
    </SafeAreaProvider>
  );
}
