// Conteúdo do popup que abre ao tocar num pino do roteiro.
//
// Componente React Native (Web) renderizado por portal dentro do Popup do
// MapLibre — mesma ponte que CountryBadgeMarkers usa para os badges de país.
// Assim o cartão segue a rotação e o zoom do globo pelo próprio MapLibre e
// continua sendo estilo do app, não HTML solto.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CATEGORY_EMOJI } from './planRoute';

/**
 * @param {{
 *   title?: string,
 *   description?: string,
 *   category?: string,
 *   day?: number,
 *   order?: number,
 *   color?: string,
 * }} props
 */
export default function PlanPointPopup({ title, description, category, day, order, color }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.pin, { backgroundColor: color || '#6C2BD9' }]}>
          <Text style={styles.pinText}>{order}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {title || 'Ponto do roteiro'}
          </Text>
          <Text style={[styles.day, { color: color || '#6C2BD9' }]}>
            {CATEGORY_EMOJI[category] || CATEGORY_EMOJI.outro} Dia {day}
          </Text>
        </View>
      </View>

      {!!description && (
        <Text style={styles.description} numberOfLines={4}>
          {description}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: 240, padding: 12, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pinText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  headerText: { flex: 1, gap: 2 },
  title: {
    color: '#F7F7F2',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  day: { fontFamily: 'Poppins_400Regular', fontSize: 10, fontWeight: '700' },
  description: {
    color: '#A2A9C5',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    lineHeight: 16,
  },
});
