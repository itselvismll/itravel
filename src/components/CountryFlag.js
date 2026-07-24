import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getAlpha2 } from '../utils/countryUtils';

/**
 * @param {{
 *   countryCode?: string | null;
 *   width?: number;
 *   height?: number;
 *   borderRadius?: number;
 *   style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
 * }} props
 */
export default function CountryFlag({
  countryCode,
  width = 72,
  height = 48,
  borderRadius = 6,
  style,
}) {
  const alpha2 = getAlpha2(countryCode);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [alpha2]);

  const containerStyle = [
    styles.container,
    { width, height, borderRadius },
    style,
  ];

  if (!alpha2 || hasImageError) {
    return (
      <View
        style={[containerStyle, styles.fallback]}
        accessibilityLabel={`País ${alpha2?.toUpperCase() || 'não identificado'}`}
      >
        <Text style={styles.fallbackText}>{alpha2?.toUpperCase() || '—'}</Text>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <Image
        source={{
          uri: `https://flagcdn.com/w160/${alpha2}.png`,
          cache: 'force-cache',
        }}
        style={styles.image}
        resizeMode="cover"
        accessibilityLabel={`Bandeira ${alpha2.toUpperCase()}`}
        onError={() => setHasImageError(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#E6E8EF',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(13,19,38,0.12)',
  },
  fallbackText: {
    color: '#555D72',
    fontSize: 12,
    fontWeight: '700',
  },
});
