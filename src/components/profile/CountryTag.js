// A etiqueta de bagagem de um país: furo, bandeira + código ISO, divisória
// tracejada e nome.
//
// Estava duplicada inline nas duas seções do ProfileScreen, com a wishlist
// repetindo o mesmo JSX só para trocar duas cores. Aqui ela é um componente só,
// e a diferença entre as seções vira uma prop — que é o que permite o grid e o
// modal desenharem o MESMO item sem uma segunda cópia aparecer.
//
// As medidas (104×58) e os offsets são os originais, não uma reconstrução: o
// visual da tela não muda com esta extração.
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import CountryFlag from '../CountryFlag';
import { getAlpha2 } from '../../utils/countryUtils';
import { countryLabel } from '../../utils/countryContinents';

export const TAG_WIDTH = 104;
export const TAG_HEIGHT = 58;

// Cores do furo no passaporte. A wishlist passa as dela por `accentColor`.
const DEFAULT_HOLE = '#0D1326';
const DEFAULT_HOLE_BORDER = '#A0906C';
const DEFAULT_CODE_COLOR = '#D97706';

/**
 * @param {{
 *   country: { country_code?: string, country_name?: string },
 *   rotation?: number,
 *   accentColor?: string,
 *   accentBorderColor?: string,
 * }} props
 */
export default function CountryTag({
  country,
  rotation = 0,
  accentColor,
  accentBorderColor,
}) {
  const code = getAlpha2(country?.country_code).toUpperCase();

  return (
    <View style={[styles.travelTag, { transform: [{ rotate: `${rotation}deg` }] }]}>
      <View
        style={[
          styles.tagHole,
          !!accentColor && {
            backgroundColor: accentColor,
            borderColor: accentBorderColor || accentColor,
          },
        ]}
      />
      <View style={styles.tagCountryMark}>
        <CountryFlag countryCode={country?.country_code} width={24} height={16} borderRadius={2} />
        <Text style={[styles.tagCountryCode, !!accentColor && { color: accentBorderColor || accentColor }]}>
          {code}
        </Text>
      </View>
      <View style={styles.tagDivider} />
      <View style={styles.tagFooter}>
        <Text style={styles.tagName} numberOfLines={1}>
          {countryLabel(country).toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  travelTag: {
    width: TAG_WIDTH,
    height: TAG_HEIGHT,
    backgroundColor: '#F3ECDC',
    borderRadius: 10,
    ...Platform.select({
      web: { boxShadow: '2px 3px 4px rgba(0,0,0,0.25)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 2, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
      },
    }),
    overflow: 'hidden',
  },
  tagHole: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: DEFAULT_HOLE,
    borderWidth: 1,
    borderColor: DEFAULT_HOLE_BORDER,
    zIndex: 2,
  },
  tagCountryMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tagCountryCode: {
    color: DEFAULT_CODE_COLOR,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tagDivider: {
    position: 'absolute',
    bottom: 18,
    left: 8,
    right: 8,
    borderBottomWidth: 1,
    borderColor: '#C8BFA5',
    borderStyle: 'dashed',
  },
  tagFooter: {
    position: 'absolute',
    bottom: 5,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tagName: {
    fontWeight: '700',
    fontSize: 9,
    color: '#46371E',
    flex: 1,
  },
});
