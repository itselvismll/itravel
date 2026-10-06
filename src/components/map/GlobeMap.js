// Fallback nativo do GlobeMap. O MapLibre GL JS é uma lib de DOM/WebGL de
// browser, então no iOS/Android este componente não renderiza mapa — a GlobeScreen
// continua usando a lista de países no native (mesmo comportamento de hoje com o
// Leaflet). A implementação real vive em GlobeMap.web.js.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../utils/constants';
import { useLocale } from '../../i18n/LocaleProvider';

// Mesma assinatura de props do GlobeMap.web.js (o TS resolve este arquivo).
export default function GlobeMap({
  onMapReady = undefined,
  onError = undefined,
  showGlobeControl = true,
  style = undefined,
}) {
  const { t } = useLocale();
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{t('globe.webOnly')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dark,
    padding: 24,
  },
  text: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
  },
});
