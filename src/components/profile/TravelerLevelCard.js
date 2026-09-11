// Card de nível do viajante — medalha, progresso e a trilha dos 5 níveis.
//
// Substitui o layout antigo, que era um emoji grande (🌍/👑) ao lado do nome.
// Nada aqui é emoji: a medalha e os selos são SVG, e os símbolos internos são
// ícones vetoriais do Ionicons. Emoji muda de desenho conforme o sistema
// operacional e a fonte, então o mesmo card virava outra coisa entre Android,
// iOS e navegador.
//
// POR QUE É UM COMPONENTE COMPARTILHADO
//
// O card existia duas vezes, em duas versões diferentes: o perfil próprio usava
// getLevelInfo (utils/travelerLevels.js) e o perfil público tinha uma CÓPIA da
// lista de níveis, com limites que não batiam — em travelerLevels o Explorador
// começa em 5 países, na cópia começava em 6. O mesmo usuário com 5 países se
// via como "Explorador" no próprio perfil e como "Viajante" no público. Agora há
// uma fonte só, e as duas telas mostram o mesmo nível.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { TRAVELER_LEVELS } from '../../utils/travelerLevels';

// Paleta. O roxo é a base do app; o dourado aparece SÓ no nível atual — é o que
// faz o olho achar "onde eu estou" na trilha antes de ler qualquer texto.
const PURPLE = '#6C2BD9';
const PURPLE_LIGHT = '#A78BFA';
const STAR_PURPLE = '#9D6BF2';
const GOLD_LIGHT = '#F1C463';
const GOLD_DARK = '#C99423';
const LOCKED = '#C7CBDA';

const MEDAL_SIZE = 54;
const BADGE_CURRENT = 34;
const BADGE_OTHER = 26;
// Altura fixa da faixa dos selos: com selos de tamanhos diferentes, é ela que dá
// uma linha de centro única para os trilhos se apoiarem.
const BADGE_SLOT = BADGE_CURRENT + 4;

/**
 * A medalha do nível atual, em destaque no cabeçalho.
 *
 * Círculo com gradiente radial roxo escuro→claro, contorno branco e um anel
 * pontilhado por dentro. O globo é `globe-outline` do Ionicons — vetorial e em
 * linha, sobreposto ao SVG em vez de desenhado à mão: um path de globo escrito
 * na unha ficaria pior e seria mais difícil de manter.
 */
function LevelMedal() {
  const center = MEDAL_SIZE / 2;

  return (
    <View style={styles.medal}>
      <Svg width={MEDAL_SIZE} height={MEDAL_SIZE}>
        <Defs>
          {/* Foco deslocado para cima e para a esquerda: dá o volume de medalha,
              como se a luz viesse daquele canto. Centrado, o círculo fica chapado. */}
          <RadialGradient id="medalFill" cx="35%" cy="30%" r="78%">
            <Stop offset="0" stopColor="#B79CF0" />
            <Stop offset="1" stopColor="#5B1FB8" />
          </RadialGradient>
        </Defs>

        <Circle
          cx={center}
          cy={center}
          r={center - 2}
          fill="url(#medalFill)"
          stroke="#FFFFFF"
          strokeWidth={2}
        />
        <Circle
          cx={center}
          cy={center}
          r={center - 9}
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </Svg>

      <View style={styles.medalIcon} pointerEvents="none">
        <Ionicons name="globe-outline" size={24} color="#FFFFFF" />
      </View>
    </View>
  );
}

/**
 * Um selo da trilha, nos três estados.
 *
 * @param {{ state: 'done' | 'current' | 'locked' }} props
 */
function TrackBadge({ state }) {
  const size = state === 'current' ? BADGE_CURRENT : BADGE_OTHER;
  const center = size / 2;

  return (
    <View style={[styles.badge, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GOLD_LIGHT} />
            <Stop offset="1" stopColor={GOLD_DARK} />
          </LinearGradient>
        </Defs>

        {state === 'current' && (
          <>
            {/* Dois anéis: branco por fora, dourado por dentro. É o "halo" que
                separa o nível atual dos outros mesmo em tela pequena. */}
            <Circle cx={center} cy={center} r={center - 1} fill="none" stroke="#FFFFFF" strokeWidth={2} />
            <Circle cx={center} cy={center} r={center - 3} fill="none" stroke={GOLD_LIGHT} strokeWidth={1.5} />
            <Circle cx={center} cy={center} r={center - 5} fill="url(#goldFill)" />
          </>
        )}

        {state === 'done' && <Circle cx={center} cy={center} r={center - 1} fill={PURPLE} />}

        {state === 'locked' && (
          <Circle
            cx={center}
            cy={center}
            r={center - 1}
            fill="none"
            stroke={LOCKED}
            strokeWidth={1.5}
            strokeDasharray="3 2.5"
          />
        )}
      </Svg>

      <View style={styles.badgeIcon} pointerEvents="none">
        {state === 'current' && <Ionicons name="star" size={15} color="#FFFFFF" />}
        {state === 'done' && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        {state === 'locked' && <Ionicons name="lock-closed-outline" size={12} color={LOCKED} />}
      </View>
    </View>
  );
}

/**
 * @param {{
 *   countryCount: number,
 *   levelInfo: { current: any, next: any, progress: number },
 *   light?: boolean,
 * }} props
 */
export default function TravelerLevelCard({ countryCount, levelInfo, light = false }) {
  const palette = light
    ? { title: '#0D1326', sub: '#999', label: '#8A90A6', track: '#f0f0f0' }
    : { title: '#F7F7F2', sub: '#9aa0c6', label: '#8A90A6', track: 'rgba(255,255,255,0.10)' };

  const currentIndex = TRAVELER_LEVELS.findIndex(
    (level) => level.level === levelInfo.current.level
  );
  const remaining = levelInfo.next
    ? Math.max(0, levelInfo.next.minCountries - countryCount)
    : 0;

  return (
    <>
      <View style={styles.headerRow}>
        <LevelMedal />
        <View style={{ flex: 1 }}>
          <Text style={[styles.levelName, { color: palette.title }]}>
            {levelInfo.current.name}
          </Text>
          <Text style={[styles.levelCount, { color: palette.sub }]}>
            {countryCount} {countryCount === 1 ? 'país visitado' : 'países visitados'}
          </Text>
        </View>
      </View>

      {/* Barra de progresso: mantida como estava, só herdando a cor de trilho
          do tema do card. */}
      <View style={[styles.progressBar, { backgroundColor: palette.track }]}>
        <View style={[styles.progressFill, { width: `${Math.round(levelInfo.progress * 100)}%` }]} />
      </View>

      {/* Trilha dos níveis.
          São CINCO, e não três: Iniciante, Viajante, Explorador, Globetrotter e
          Lenda Viajante, com os limites de utils/travelerLevels.js. */}
      <View style={styles.track}>
        {TRAVELER_LEVELS.map((level, index) => {
          const state =
            index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'locked';

          // Um trilho é roxo quando o nível daquele lado já foi alcançado, então
          // a linha "enche" junto com o progresso do usuário.
          const leftDone = index <= currentIndex;
          const rightDone = index < currentIndex;

          return (
            <View key={level.level} style={styles.trackCell}>
              <View style={styles.railRow} pointerEvents="none">
                <View
                  style={[
                    styles.rail,
                    { backgroundColor: leftDone ? PURPLE_LIGHT : LOCKED },
                    index === 0 && styles.railHidden,
                  ]}
                />
                <View
                  style={[
                    styles.rail,
                    { backgroundColor: rightDone ? PURPLE_LIGHT : LOCKED },
                    index === TRAVELER_LEVELS.length - 1 && styles.railHidden,
                  ]}
                />
              </View>

              <View style={styles.badgeSlot}>
                <TrackBadge state={state} />
              </View>

              <Text
                numberOfLines={2}
                style={[
                  styles.trackLabel,
                  { color: palette.label },
                  state === 'current' && { color: palette.title, fontWeight: '800' },
                ]}
              >
                {level.name}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.footerRow}>
        <Ionicons name="star" size={13} color={STAR_PURPLE} />
        <Text style={[styles.footerText, { color: palette.sub }]}>
          {levelInfo.next
            ? `Faltam ${remaining} ${remaining === 1 ? 'país' : 'países'} para ${levelInfo.next.name}`
            : 'Nível máximo atingido'}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },

  medal: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // Brilho discreto por baixo da medalha. No web vira box-shadow; no nativo,
    // sombra de elevação.
    shadowColor: PURPLE,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  medalIcon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  levelName: { fontSize: 18, fontWeight: '700' },
  levelCount: { fontSize: 12, marginTop: 2 },

  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: PURPLE, borderRadius: 3 },

  track: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  trackCell: { flex: 1, alignItems: 'center' },

  // Os trilhos ficam ATRÁS dos selos, numa linha só, na altura do centro da
  // faixa. Como a faixa tem altura fixa, essa linha vale para os três tamanhos
  // de selo.
  railRow: {
    position: 'absolute',
    top: BADGE_SLOT / 2 - 1,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  rail: { flex: 1, height: 2 },
  railHidden: { backgroundColor: 'transparent' },

  badgeSlot: { height: BADGE_SLOT, alignItems: 'center', justifyContent: 'center' },
  badge: { alignItems: 'center', justifyContent: 'center' },
  badgeIcon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },

  trackLabel: { fontSize: 9, textAlign: 'center', marginTop: 5, lineHeight: 12 },

  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  footerText: { fontSize: 11, flex: 1 },
});
