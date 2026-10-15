// Placeholder NATIVO (React Native puro, fora da WebView) para cobrir o
// instante entre a tela do Mapa montar e o globo nativo pintar o primeiro
// quadro — ver AGENTS.md / a investigação do flash preto no Android.
//
// O flash tem duas fases fora do alcance de CSS/JS injetado na WebView: a
// superfície nativa do `android.webkit.WebView` antes do primeiro
// `onPageFinished`, e o instante de criação do próprio DOM Component. Esta
// View cobre as duas, porque ela mora INTEIRAMENTE do lado React Native — ela
// nem sabe que existe WebView por baixo.
//
// O visual replica o GlobeLoadingOverlay de GlobeMap.web.js (fundo #0D1326,
// halo roxo pulsando, anel girando, símbolo do Journi) para a troca entre os
// dois ser imperceptível. UMA simplificação deliberada: sem o campo de
// estrelas de fundo (SVG data URI com `backgroundImage`, que não existe em
// React Native) — reproduzir isso aqui exigiria `react-native-svg` com um
// `<pattern>` de verdade para ladrilhar, o que é mais risco do que vale para
// um fundo que fica coberto em menos de um segundo. A cor sólida já é a MESMA
// do overlay web.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useLocale } from '../../i18n/LocaleProvider';

const JOURNI_SYMBOL = require('../../../assets/journi_simbolo.png');

// Mesmo valor de FADE_MS em GlobeMap.web.js: a transição daqui para o globo
// real precisa ter a MESMA duração do fade que o overlay web já faz sozinho,
// senão a troca lê como dois efeitos em vez de um só.
const FADE_MS = 450;

const PULSE_MS = 900;
const SPIN_MS = 1400;

/**
 * @param {{ visible: boolean }} props
 */
export default function GlobeLoadingPlaceholder({ visible }) {
  const { t } = useLocale();
  // Continua montada durante o fade-out: sem isso o placeholder sumiria de
  // estalo no frame em que `visible` vira false, em vez de desvanecer.
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.setValue(1);
      return;
    }
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, opacity]);

  // O halo e o anel giram/pulsam o tempo todo que a tela existe — inclusive
  // durante o fade-out, para não travar num quadro parado no meio da saída.
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: PULSE_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: SPIN_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    pulseLoop.start();
    spinLoop.start();
    return () => {
      pulseLoop.stop();
      spinLoop.stop();
    };
  }, [pulse, spin]);

  if (!mounted) return null;

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.root, { opacity }]}
      accessibilityRole="progressbar"
      accessibilityLabel={t('globe.loading')}
    >
      <View style={styles.badge}>
        <Animated.View
          style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
        />
        <Animated.View style={[styles.ring, { transform: [{ rotate: spinDeg }] }]} />
        <Image source={JOURNI_SYMBOL} resizeMode="contain" style={styles.symbol} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#0D1326',
    alignItems: 'center',
    justifyContent: 'center',
    // Acima do globo nativo (mapWrapper) e abaixo da barra de IA/busca/seletor
    // de dia, que já usam zIndex 1001 em GlobeScreen.js.
    zIndex: 5,
  },
  badge: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: 'rgba(108,43,217,0.55)',
  },
  ring: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    borderTopColor: 'rgba(0,209,193,0.85)',
  },
  symbol: {
    width: 52,
    height: 52,
  },
});
