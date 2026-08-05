import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getLevelInfo } from '../utils/travelerLevels';
import CountryFlag from './CountryFlag';

// Mesma correção usada no autocomplete de países do mapa: bandeiras via imagem
// (flagcdn.com, através do CountryFlag compartilhado) em vez de emoji Unicode.
// Regional indicator symbols (🇧🇷 etc.) não têm glifo de bandeira em várias
// combinações de SO/navegador — no Windows, por exemplo, caem para o código de
// texto cru ("BR"). Isso também garante que territórios sem emoji de bandeira
// dedicado (Malvinas/FLK, Faroé/FRO, Polinésia Francesa/PYF...) apareçam com a
// bandeira real, já que o CountryFlag busca o PNG pelo alpha-2 do território.
//
// De propósito, este componente não usa nenhum ícone de fonte vetorial
// (Ionicons etc.): a exportação web (toPng com skipFonts:true, em
// ProfileScreen) não embute fontes customizadas — e um ícone de fonte sem a
// fonte embutida vira uma caixa vazia no PNG exportado. O logo é uma imagem
// PNG normal (não depende de fonte), então continua seguro de usar.
const ACCENT_COLORS = ['#6C2BD9', '#FF4D6D', '#FF9A00', '#00D1C1'];

const CARD_WIDTH = 380;
const CARD_PADDING = 24;
const MAX_ROWS = 3;

// Quantos círculos cabem por linha = floor((larguraDisponível + gap) / (tamanho + gap)),
// a mesma conta que o próprio flex-wrap faz para decidir quando quebrar linha.
// Calculando aqui conseguimos saber exatamente quantos itens preenchem 3 linhas
// cheias e cortar o resto num "+N", em vez de deixar vazar para uma 4ª linha.
const computeMaxVisible = (sectionPadding, circleSize, gap, maxRows = MAX_ROWS) => {
  const innerWidth = CARD_WIDTH - CARD_PADDING * 2 - sectionPadding * 2;
  const columns = Math.max(1, Math.floor((innerWidth + gap) / (circleSize + gap)));
  return columns * maxRows;
};

const VISITED_PADDING = 16;
const VISITED_CIRCLE = 40;
const VISITED_GAP = 10;
const MAX_VISITED_VISIBLE = computeMaxVisible(VISITED_PADDING, VISITED_CIRCLE, VISITED_GAP);

const WISH_PADDING = 14;
const WISH_CIRCLE = 32;
const WISH_GAP = 8;
const MAX_WISH_VISIBLE = computeMaxVisible(WISH_PADDING, WISH_CIRCLE, WISH_GAP);

// Se couber tudo, mostra tudo. Se não, mostra (limite - 1) bandeiras + 1 chip
// "+N" no lugar do último slot, pra nunca estourar as 3 linhas.
const buildGridItems = (codes, maxVisible) => {
  if (codes.length <= maxVisible) return { visible: codes, moreCount: 0 };
  return { visible: codes.slice(0, maxVisible - 1), moreCount: codes.length - (maxVisible - 1) };
};

function FlagCircle({ code, size, borderColor }) {
  const flagSize = size - 8;
  return (
    <View style={[styles.flagCircleBase, { width: size, height: size, borderRadius: size / 2, borderColor }]}>
      <CountryFlag countryCode={code} width={flagSize} height={flagSize} borderRadius={flagSize / 2} />
    </View>
  );
}

function MoreCircle({ count, size }) {
  return (
    <View style={[styles.flagCircleBase, styles.moreCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.moreText}>+{count}</Text>
    </View>
  );
}

/**
 * @typedef {Object} ShareCardProps
 * @property {{ username?: string, avatar_url?: string } | null} [profile]
 * @property {string} [avatarUrl] - fallback (ex.: avatar do Google) quando o perfil não tem avatar_url próprio
 * @property {string[]} [visitedCountryCodes]
 * @property {string[]} [wishlistCodes]
 */

const ShareCard = forwardRef(
  /**
   * @param {ShareCardProps} props
   * @param {React.ForwardedRef<any>} ref
   */
  function ShareCard(
    { profile, avatarUrl, visitedCountryCodes, wishlistCodes },
    ref
  ) {
    const username = profile?.username || 'viajante';
    const initial = username[0]?.toUpperCase() || 'V';
    const avatarSrc = profile?.avatar_url || avatarUrl;

    const visited = visitedCountryCodes || [];
    const wishlist = wishlistCodes || [];
    const levelInfo = getLevelInfo(visited.length);

    const visitedGrid = buildGridItems(visited, MAX_VISITED_VISIBLE);
    const wishlistGrid = buildGridItems(wishlist, MAX_WISH_VISIBLE);

    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        {/* Glow decorativo no canto superior, com as cores da marca */}
        <View style={styles.glowWrap} pointerEvents="none">
          <LinearGradient
            colors={['#6C2BD9', '#FF4D6D', '#FF9A00']}
            style={styles.glow}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        </View>

        {/* 1. Header — logo + "PASSAPORTE" à esquerda, avatar com borda gradiente à direita */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Image
              source={require('../../assets/journi_simbolo.png')}
              style={styles.logoIcon}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>PASSAPORTE</Text>
          </View>

          <View style={styles.avatarRingOuter}>
            <LinearGradient
              colors={['#6C2BD9', '#FF4D6D', '#FF9A00']}
              style={styles.avatarRingGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.avatarInner}>
                {avatarSrc ? (
                  <Image source={{ uri: avatarSrc }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>{initial}</Text>
                )}
              </View>
            </LinearGradient>
          </View>
        </View>

        {/* 2. Identificação — @username + nível */}
        <View style={styles.identityRow}>
          <Text style={styles.username} numberOfLines={1}>@{username}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelIcon}>{levelInfo.current.icon}</Text>
            <Text style={styles.levelText}>
              {levelInfo.current.name} nível {levelInfo.current.level}
            </Text>
          </View>
        </View>

        {/* 3. Número hero */}
        <View style={styles.heroRow}>
          <Text style={styles.heroNumber}>{visited.length}</Text>
          <Text style={styles.heroLabel}>países{'\n'}visitados</Text>
        </View>

        {/* 4. Card — países visitados (todos, em grid, até 3 linhas) */}
        <View style={styles.gridCard}>
          {visitedGrid.visible.length === 0 ? (
            <Text style={styles.emptyText}>Sua jornada está só começando ✈</Text>
          ) : (
            <View style={styles.visitedGrid}>
              {visitedGrid.visible.map((code, i) => (
                <FlagCircle
                  key={`${code}-${i}`}
                  code={code}
                  size={VISITED_CIRCLE}
                  borderColor={ACCENT_COLORS[i % ACCENT_COLORS.length]}
                />
              ))}
              {visitedGrid.moreCount > 0 && (
                <MoreCircle count={visitedGrid.moreCount} size={VISITED_CIRCLE} />
              )}
            </View>
          )}
        </View>

        {/* 5. Card — wishlist "sonhando com" (todos, em grid, até 3 linhas) */}
        <View style={styles.wishlistSection}>
          <Text style={styles.wishlistTitle}>sonhando com</Text>
          {wishlistGrid.visible.length === 0 ? (
            <Text style={styles.emptyText}>Nenhum destino na lista ainda</Text>
          ) : (
            <View style={styles.wishlistGrid}>
              {wishlistGrid.visible.map((code, i) => (
                <FlagCircle
                  key={`${code}-${i}`}
                  code={code}
                  size={WISH_CIRCLE}
                  borderColor={ACCENT_COLORS[i % ACCENT_COLORS.length]}
                />
              ))}
              {wishlistGrid.moreCount > 0 && (
                <MoreCircle count={wishlistGrid.moreCount} size={WISH_CIRCLE} />
              )}
            </View>
          )}
        </View>

        {/* 6. Rodapé */}
        <View style={styles.footerDivider} />
        <View style={styles.footer}>
          <Text style={styles.footerText}>journi.app</Text>
        </View>
      </View>
    );
  }
);

export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#0D1326',
    borderRadius: 22,
    padding: CARD_PADDING,
    overflow: 'hidden',
  },
  glowWrap: {
    position: 'absolute',
    top: -70,
    right: -70,
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.4,
    ...Platform.select({ web: { filter: 'blur(60px)' }, default: {} }),
  },
  glow: { flex: 1, borderRadius: 100 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoIcon: { width: 26, height: 26 },
  tagline: { color: 'rgba(255,255,255,0.4)', fontFamily: 'Poppins_700Bold', fontSize: 10, letterSpacing: 2 },

  avatarRingOuter: { width: 56, height: 56 },
  avatarRingGradient: { flex: 1, borderRadius: 28, padding: 2.5 },
  avatarInner: {
    flex: 1,
    borderRadius: 25.5,
    overflow: 'hidden',
    backgroundColor: '#2b2f45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: 'white', fontFamily: 'Poppins_700Bold', fontSize: 20 },

  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, flexWrap: 'wrap' },
  username: { color: 'white', fontFamily: 'Poppins_700Bold', fontSize: 18, maxWidth: 180 },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(108,43,217,0.18)',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  levelIcon: { fontSize: 13 },
  levelText: { color: '#B79CF2', fontFamily: 'Poppins_700Bold', fontSize: 11 },

  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 16 },
  heroNumber: { color: '#00D1C1', fontFamily: 'Poppins_700Bold', fontSize: 56, lineHeight: 56 },
  heroLabel: { color: 'rgba(255,255,255,0.45)', fontFamily: 'Poppins_400Regular', fontSize: 12, lineHeight: 15, marginBottom: 8 },

  gridCard: {
    backgroundColor: '#151B33',
    borderRadius: 18,
    padding: VISITED_PADDING,
    marginTop: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  visitedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: VISITED_GAP },

  wishlistSection: {
    backgroundColor: '#151B33',
    borderRadius: 18,
    padding: WISH_PADDING,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  wishlistTitle: { color: '#FF4D6D', fontFamily: 'Poppins_700Bold', fontSize: 12, marginBottom: 10 },
  wishlistGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: WISH_GAP },

  flagCircleBase: {
    borderWidth: 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1326',
  },
  moreCircle: { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: '#202744' },
  moreText: { color: 'white', fontFamily: 'Poppins_700Bold', fontSize: 12 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontFamily: 'Poppins_400Regular', fontSize: 12, textAlign: 'center', paddingVertical: 6 },

  footerDivider: { marginTop: 22, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed' },
  footer: { marginTop: 14 },
  footerText: { color: 'rgba(255,255,255,0.4)', fontFamily: 'Poppins_400Regular', fontSize: 11, letterSpacing: 0.5 },
});
