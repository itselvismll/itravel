// Onboarding de boas-vindas — três slides sobre o globo real do app.
//
// Aparece uma única vez por conta: quem chega aqui tem
// `profiles.onboarding_completed = false`. Concluir ou pular grava `true` no
// Supabase (ver onboardingService), então nem trocar de dispositivo traz a tela
// de volta.
//
// A composição é sempre a mesma: o globo ocupa a tela inteira por trás, um
// scrim leva o fundo até #0D1326 do lado do texto, e só o painel de texto
// desliza. Assim a troca de slide não pisca o cenário — quem se move é a câmera
// do globo e a tipografia.
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OnboardingGlobe from '../../components/onboarding/OnboardingGlobe';
import { COLORS } from '../../utils/constants';

const SLIDES = [
  {
    key: 'mapa',
    title: 'Seu mundo em um mapa',
    subtitle: 'Marque os países que já visitou e veja seu globo ganhar cor.',
  },
  {
    key: 'memorias',
    title: 'Guarde suas memórias',
    subtitle: 'Adicione fotos das cidades por onde você passou.',
  },
  {
    key: 'proxima',
    title: 'Planeje a próxima',
    subtitle: 'Monte sua wishlist e crie roteiros com ajuda da IA.',
  },
];

// A partir daqui a tela comporta o layout de duas colunas: texto à esquerda,
// globo respirando à direita. Abaixo disso o texto vai para o rodapé e o globo
// fica inteiro atrás dele.
const WIDE_LAYOUT_BREAKPOINT = 900;

/**
 * @param {{ onFinish: () => void, onSkip: () => void, saving?: boolean }} props
 */
export default function OnboardingScreen({ onFinish, onSkip, saving = false }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);

  const isWide = width >= WIDE_LAYOUT_BREAKPOINT;
  const isLast = index === SLIDES.length - 1;

  // Largura do painel de texto: no layout largo ele é uma coluna de leitura, no
  // estreito ele ocupa a tela toda (é o ScrollView paginado que define a página).
  const pageWidth = width;
  const textMaxWidth = isWide ? Math.min(560, width * 0.46) : Math.min(560, width - 48);

  const goTo = useCallback((next) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, next));
    setIndex(clamped);
    scrollRef.current?.scrollTo({ x: clamped * pageWidth, animated: true });
  }, [pageWidth]);

  const handleAdvance = useCallback(() => {
    if (isLast) onFinish();
    else goTo(index + 1);
  }, [isLast, index, goTo, onFinish]);

  // `onScroll` em vez de `onMomentumScrollEnd`: na web o scroll paginado nem
  // sempre emite momentum, e sem isto o índice (e a câmera do globo) travaria no
  // slide anterior depois de um arrasto de mouse ou de um scroll horizontal.
  const handleScroll = useCallback((event) => {
    const offset = event.nativeEvent.contentOffset.x;
    const next = Math.round(offset / pageWidth);
    setIndex((current) => (next !== current && next >= 0 && next < SLIDES.length ? next : current));
  }, [pageWidth]);

  // O scrim é o que garante contraste do texto sobre qualquer parte do globo —
  // deserto claro, nuvem ou oceano escuro. No layout largo ele corre na
  // horizontal (fundo sólido à esquerda), no estreito na vertical.
  const scrimColors = useMemo(() => /** @type {[string, string, string, string]} */ (
    isWide
      ? ['#0D1326', 'rgba(13,19,38,0.92)', 'rgba(13,19,38,0.35)', 'rgba(13,19,38,0)']
      : ['rgba(13,19,38,0)', 'rgba(13,19,38,0.55)', 'rgba(13,19,38,0.95)', '#0D1326']
  ), [isWide]);

  return (
    <View style={styles.root}>
      {/* Cenário: uma única instância do globo atrás dos três slides. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <OnboardingGlobe slideIndex={index} />
      </View>

      <LinearGradient
        colors={scrimColors}
        locations={isWide ? [0, 0.34, 0.62, 1] : [0, 0.42, 0.74, 1]}
        start={isWide ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
        end={isWide ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* "Pular" discreto, no canto oposto ao avanço. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pular a apresentação"
        onPress={onSkip}
        disabled={saving}
        style={({ pressed }) => [
          styles.skip,
          { top: insets.top + 14, right: 20, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={styles.skipLabel}>Pular</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.pager}
        contentContainerStyle={{ width: pageWidth * SLIDES.length }}
      >
        {SLIDES.map((slide, slideIndex) => (
          <View
            key={slide.key}
            style={[
              styles.page,
              {
                width: pageWidth,
                paddingTop: insets.top + 32,
                // No layout estreito o texto vive no terço de baixo: o globo fica
                // com o espaço nobre em cima, que é o ponto de "ver o produto".
                justifyContent: isWide ? 'center' : 'flex-end',
                paddingBottom: (isWide ? 0 : Math.max(height * 0.12, 96)) + insets.bottom,
                paddingHorizontal: isWide ? Math.max(width * 0.07, 48) : 24,
                alignItems: isWide ? 'flex-start' : 'stretch',
              },
            ]}
          >
            <View style={{ maxWidth: textMaxWidth }}>
              <Text
                accessibilityRole="header"
                style={[
                  styles.title,
                  {
                    fontSize: isWide ? 54 : Math.min(40, width * 0.105),
                    lineHeight: isWide ? 60 : Math.min(46, width * 0.12),
                  },
                ]}
              >
                {slide.title}
              </Text>
              <Text style={[styles.subtitle, { fontSize: isWide ? 18 : 16 }]}>
                {slide.subtitle}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Rodapé fixo: os dots e o botão não deslizam junto com o texto, para o
          controle ficar no mesmo lugar nos três slides. */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: isWide ? Math.max(width * 0.07, 48) : 24,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.dots}>
          {SLIDES.map((slide, dotIndex) => (
            <Pressable
              key={slide.key}
              accessibilityRole="button"
              accessibilityLabel={`Ir para o slide ${dotIndex + 1}`}
              onPress={() => goTo(dotIndex)}
              hitSlop={10}
            >
              <View style={[styles.dot, dotIndex === index && styles.dotActive]} />
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Começar a usar o Journi' : 'Próximo slide'}
          onPress={handleAdvance}
          disabled={saving}
          style={(state) => [
            styles.cta,
            isLast && styles.ctaFinal,
            // `hovered` só existe no react-native-web; no nativo é undefined e o
            // realce fica por conta do `pressed`.
            (state.pressed || /** @type {any} */ (state).hovered)
              && (isLast ? styles.ctaFinalActive : styles.ctaActive),
            saving && styles.ctaDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <>
              <Text style={styles.ctaLabel}>{isLast ? 'Começar' : 'Continuar'}</Text>
              <Ionicons name="arrow-forward" size={17} color={COLORS.white} />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.dark },

  pager: { flex: 1 },
  page: { height: '100%' },

  title: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    // Negativo: em corpo grande o Poppins abre demais e o título perde a
    // compactação que faz ele ler como uma peça só.
    letterSpacing: -0.8,
  },
  subtitle: {
    marginTop: 16,
    color: 'rgba(247,247,242,0.72)',
    fontFamily: 'Poppins_300Light',
    lineHeight: 26,
    maxWidth: 420,
  },

  skip: {
    position: 'absolute',
    zIndex: 3,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipLabel: {
    color: 'rgba(247,247,242,0.55)',
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    letterSpacing: 0.2,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(247,247,242,0.28)',
  },
  dotActive: {
    width: 26,
    backgroundColor: COLORS.white,
    ...Platform.select({
      web: { transition: 'width 240ms ease, background-color 240ms ease' },
      default: {},
    }),
  },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minWidth: 148,
    height: 52,
    paddingHorizontal: 26,
    borderRadius: 26,
    backgroundColor: 'rgba(247,247,242,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(247,247,242,0.22)',
    ...Platform.select({
      web: { transition: 'background-color 200ms ease, border-color 200ms ease' },
      default: {},
    }),
  },
  // O roxo cheio fica guardado para o último passo: é o único momento em que o
  // botão pede uma decisão, e não só "próximo".
  ctaFinal: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  ctaActive: {
    backgroundColor: 'rgba(247,247,242,0.18)',
    borderColor: 'rgba(247,247,242,0.34)',
  },
  ctaFinalActive: {
    backgroundColor: COLORS.primaryDark,
    borderColor: COLORS.primaryDark,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaLabel: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
});
