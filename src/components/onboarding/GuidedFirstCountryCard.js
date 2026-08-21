// Card da ação guiada — o segundo passo do onboarding, sobre o globo.
//
// Sobreposição, não modal: o `pointerEvents="box-none"` do wrapper deixa girar,
// dar zoom e clicar no globo por trás dele. O card orienta e sai de cena assim
// que o primeiro país é marcado.
import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, Pressable, StyleSheet, Platform, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../utils/constants';

// backdrop-filter é CSS: existe só no web. Mesmo tratamento do pill de países
// visitados na GlobeScreen.
const blur = /** @type {any} */ (
  Platform.OS === 'web'
    ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }
    : null
);

/**
 * @param {{ onSkip: () => void, bottom: number }} props
 */
export default function GuidedFirstCountryCard({ onSkip, bottom }) {
  // Entrada em fade + subida curta: o card chega junto com o globo, sem cortar
  // a transição vinda dos slides.
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 520,
      delay: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [enter]);

  // O ponto teal pulsa devagar — é o sinal de "é aqui que se toca", e é a única
  // coisa animada em repouso no card.
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.wrapper, { bottom }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          blur,
          {
            opacity: enter,
            transform: [{
              translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
            }],
          },
        ]}
      >
        <View style={styles.marker}>
          <Animated.View
            style={[
              styles.markerHalo,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.5] }),
                transform: [{
                  scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] }),
                }],
              },
            ]}
          />
          <Ionicons name="location" size={18} color={COLORS.teal} />
        </View>

        <View style={styles.copy}>
          <Text style={styles.title} accessibilityRole="header">Marque seu primeiro país</Text>
          <Text style={styles.subtitle}>
            Toque em um país que você já visitou para começar seu mapa.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pular esta etapa"
          onPress={onSkip}
          hitSlop={8}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.skipLabel}>Pular</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    maxWidth: 460,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(13,19,38,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.28)',
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

  marker: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,209,193,0.12)',
  },
  markerHalo: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.teal,
  },

  copy: { flex: 1 },
  title: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 3,
    color: 'rgba(247,247,242,0.62)',
    fontFamily: 'Poppins_300Light',
    fontSize: 13,
    lineHeight: 18,
  },

  skip: { paddingVertical: 6, paddingHorizontal: 4 },
  skipLabel: {
    color: 'rgba(247,247,242,0.5)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
  },
});
