// Celebração do primeiro país marcado — o "momento aha" do onboarding.
//
// Deliberadamente contida: um anel teal que se abre uma vez e uma faixa curta
// com o nome do país. Quem faz o trabalho pesado é o próprio globo atrás, que
// nesse instante acende o território em roxo de visitado (countryFill).
//
// Some sozinha e não bloqueia nada: `pointerEvents="none"` no wrapper.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Platform, Easing } from 'react-native';
import { COLORS } from '../../utils/constants';

// Tempo em tela antes do fade de saída.
const HOLD_MS = 2600;
const FADE_OUT_MS = 420;

/**
 * @param {{ countryName?: string | null, onDone: () => void }} props
 */
export default function FirstCountryCelebration({ countryName = null, onDone }) {
  const enter = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;

  // Ref para o callback: o efeito roda uma vez só, e sem isto uma função nova no
  // pai reiniciaria a animação no meio.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const useNative = Platform.OS !== 'web';

    Animated.parallel([
      Animated.spring(enter, {
        toValue: 1,
        friction: 7,
        tension: 70,
        useNativeDriver: useNative,
      }),
      // Uma volta só: o anel abre e dissolve, sem virar um loop de spinner.
      Animated.timing(ring, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: useNative,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(exit, {
        toValue: 0,
        duration: FADE_OUT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: useNative,
      }).start(() => onDoneRef.current?.());
    }, HOLD_MS);

    return () => clearTimeout(timer);
  }, [enter, ring, exit]);

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <Animated.View
        style={[
          styles.stack,
          {
            opacity: Animated.multiply(enter, exit),
            transform: [{
              scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
            }],
          },
        ]}
      >
        <View style={styles.ringSlot}>
          <Animated.View
            style={[
              styles.ring,
              {
                opacity: ring.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.9, 0.5, 0] }),
                transform: [{
                  scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] }),
                }],
              },
            ]}
          />
          <View style={styles.globeDot}>
            <Text style={styles.globeGlyph}>🌎</Text>
          </View>
        </View>

        <View style={styles.banner}>
          <Text style={styles.title}>Seu mapa começou!</Text>
          {countryName ? (
            <Text style={styles.subtitle}>{countryName} agora é seu.</Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  stack: { alignItems: 'center' },

  ringSlot: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: COLORS.teal,
  },
  globeDot: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,19,38,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.32)',
  },
  globeGlyph: { fontSize: 30, lineHeight: 38 },

  banner: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 18,
    backgroundColor: 'rgba(13,19,38,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.24)',
    ...Platform.select({
      web: { boxShadow: '0 14px 38px rgba(4,7,18,0.5)' },
      default: {
        shadowColor: '#050816',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 14,
      },
    }),
  },
  title: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    color: 'rgba(247,247,242,0.62)',
    fontFamily: 'Poppins_300Light',
    fontSize: 13,
  },
});
