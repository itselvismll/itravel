import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export default function StarRating({ rating = 0, size = 13, gap = 2, activeColor = null, inactiveColor = null, max = 5 }) {
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {Array.from({ length: max }, (_, i) => i + 1).map(s => (
        // Ícone vetorial, não o caractere ★: o glifo tipográfico muda de
        // largura e de peso conforme a fonte que o sistema escolhe, e as cinco
        // estrelas ficavam desalinhadas entre aparelhos.
        <Ionicons
          key={s}
          name={s <= rating ? 'star' : 'star-outline'}
          size={size}
          color={s <= rating ? (activeColor || colors.brand) : (inactiveColor || '#e0e0e0')}
        />
      ))}
    </View>
  );
}
