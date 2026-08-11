// Pill flutuante sobre o país no globo, em dois estados:
// - expandido: bandeira + nome em português
// - compacto: só a bandeira, quando não cabe o nome sem colidir com outro badge
//
// O badge é IDENTIFICAÇÃO do país e nada mais: o estilo é o mesmo para todos,
// visitado ou não. Quem responde "onde eu já fui" é o território pintado por
// baixo (ver countryFill.js) — dois canais dizendo a mesma coisa deixariam o
// globo colorido demais, e a leitura de conquista funciona melhor no mapa do que
// numa nuvem de pills.
//
// Usa o CountryFlag compartilhado nos dois estados, então herda o fallback de
// bandeira quebrada e o cache de imagem que o resto do app já tem.
import React from 'react';
import { Text, StyleSheet, Platform, Pressable } from 'react-native';
import CountryFlag from '../CountryFlag';
import { COLORS } from '../../utils/constants';

// A largura do pill é fixa e conhecida — o cálculo de colisão precisa dela antes
// de o elemento existir no DOM. A altura é a mesma nos três status de propósito:
// a colisão trabalha com uma caixa só.
export const COMPACT_BADGE_WIDTH = 38;
export const BADGE_HEIGHT = 29;

/**
 * @param {{
 *   countryCode: string,
 *   name: string,
 *   compact?: boolean,
 *   hidden?: boolean,
 *   onPress?: () => void,
 * }} props
 */
export default function CountryBadge({
  countryCode,
  name,
  compact = false,
  hidden = false,
  onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      // Escondido pelo filtro de zoom: continua no DOM (para o fade e para a
      // medida de largura seguir valendo), mas sai do alcance do mouse e dos
      // leitores de tela.
      {...(hidden ? { 'aria-hidden': true, tabIndex: -1 } : null)}
      // No estado compacto o nome não está escrito em lugar nenhum; o title
      // devolve ele no hover, sem mudar o tamanho do pill (que é o que a
      // detecção de colisão mediu).
      {...(compact && Platform.OS === 'web' ? { title: name } : null)}
      style={[styles.badge, compact && styles.badgeCompact, hidden && styles.hidden]}
    >
      <CountryFlag countryCode={countryCode} width={22} height={15} borderRadius={3} />
      {!compact && (
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: BADGE_HEIGHT,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    // Um estilo só, para todos os países. Escuro e translúcido: precisa ser
    // legível sobre imagem de satélite (que varia de deserto claro a oceano
    // escuro) sem disputar atenção com a cor do território por baixo.
    backgroundColor: 'rgba(13,19,38,0.78)',
    borderColor: 'rgba(255,255,255,0.22)',
    // Sem o nowrap o pill quebra em duas linhas dentro do marker, que não tem
    // largura definida.
    ...Platform.select({
      web: {
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        // Fade de entrada e saída quando o filtro de zoom muda de opinião sobre
        // este país. Sem isso, uma pincelada de zoom faz dezenas de badges
        // aparecerem e sumirem de um quadro para o outro.
        transitionProperty: 'opacity',
        transitionDuration: '220ms',
        transitionTimingFunction: 'ease-out',
      },
      default: {},
    }),
  },
  // Fora do nível de zoom atual. Continua ocupando lugar no layout — é o que
  // mantém a largura medida válida para quando o país voltar.
  hidden: {
    opacity: 0,
    ...Platform.select({
      web: { pointerEvents: 'none' },
      default: {},
    }),
  },
  badgeCompact: {
    gap: 0,
    paddingHorizontal: 7,
  },
  name: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
