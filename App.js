import React from 'react';
import { LogBox, View, ActivityIndicator } from 'react-native';
import {
  useFonts,
  Poppins_700Bold,
  Poppins_600SemiBold,
  Poppins_400Regular,
  Poppins_300Light,
} from '@expo-google-fonts/poppins';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UploadProvider } from './src/context/UploadContext';
import { ActivePlanProvider } from './src/context/ActivePlanContext';
import AppNavigator from './src/navigation/AppNavigator';
import { SATELLITE_TILE_LOG_PATTERN } from './src/components/map/globeConfig';

// O 403 de um tile de satélite (token/plano sem direito à imagem naquele domínio
// — ver globeConfig.js) não tem o que fazer a respeito em tempo de execução, e no
// dev nativo viraria caixa vermelha do LogBox a cada tile. UM padrão, que exige a
// URL do imagery — do Mapbox ou da Stadia — E o 403 juntos: todo o resto do app
// continua reportando normalmente. Nada de ignoreAllLogs.
//
// No web isto é inofensivo e não faz nada: o LogBox do react-native-web é um stub
// vazio. Quem cala o erro lá é o filtro no `map.on('error')` do GlobeMap.web.js —
// é ele que impede o overlay vermelho do mapa de aparecer.
LogBox.ignoreLogs([SATELLITE_TILE_LOG_PATTERN]);

export default function App() {
  // Todo peso referenciado em algum `fontFamily` do app precisa estar AQUI.
  //
  // Peso que não é carregado não avisa: o RN não acha a família, cai no sistema
  // sem erro nenhum, e o texto fica com um peso parecido o bastante para passar
  // despercebido. Foi o que aconteceu com o 600SemiBold, usado em 5 lugares
  // (badge de país, popup de ponto do roteiro, contador do globo, botão do
  // ChooseUsername) e ausente desta lista.
  const [fontsLoaded] = useFonts({
    Poppins_700Bold,
    Poppins_600SemiBold,
    Poppins_400Regular,
    Poppins_300Light,
  });

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
        {/* A tela de roteiros salvos (ProfileStack) aplica o roteiro e o globo
            (tab Map) o desenha: são ramos diferentes da navegação, então o
            estado do roteiro ativo precisa viver acima dos dois. */}
        <ActivePlanProvider>
          <AppNavigator />
        </ActivePlanProvider>
      </UploadProvider>
    </SafeAreaProvider>
  );
}
