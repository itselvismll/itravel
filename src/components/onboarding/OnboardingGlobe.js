// Fallback nativo do cenário dos slides.
//
// O MapLibre GL JS é uma lib de DOM/WebGL de browser — no iOS/Android não existe
// globo (mesma limitação da GlobeScreen). Aqui fica o símbolo do Journi sobre um
// halo roxo, para o slide não abrir um buraco vazio.
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const JOURNI_SYMBOL = require('../../../assets/journi_simbolo.png');

// Mesma assinatura de props do OnboardingGlobe.web.js.
export default function OnboardingGlobe({ slideIndex = 0, style = undefined }) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.halo} />
      <Image source={JOURNI_SYMBOL} resizeMode="contain" style={styles.symbol} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#05070F',
  },
  halo: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(108,43,217,0.22)',
  },
  symbol: { width: 96, height: 96 },
});
