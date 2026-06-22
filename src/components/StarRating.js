import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../theme/colors';

export default function StarRating({ rating = 0, size = 13, gap = 2, activeColor, inactiveColor, max = 5 }) {
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {Array.from({ length: max }, (_, i) => i + 1).map(s => (
        <Text
          key={s}
          style={{
            color: s <= rating ? (activeColor || colors.brand) : (inactiveColor || '#e0e0e0'),
            fontSize: size,
          }}
        >
          ★
        </Text>
      ))}
    </View>
  );
}
