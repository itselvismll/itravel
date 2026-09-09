// Conteúdo do popup que abre ao tocar num pino do roteiro.
//
// Componente React Native (Web) renderizado por portal dentro do Popup do
// MapLibre — mesma ponte que CountryBadgeMarkers usa para os badges de país.
// Assim o cartão segue a rotação e o zoom do globo pelo próprio MapLibre e
// continua sendo estilo do app, não HTML solto.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_EMOJI } from './planRoute';
import { ISOCHRONE_COLOR } from './isochroneLayer';

/**
 * @param {{
 *   title?: string,
 *   description?: string,
 *   category?: string,
 *   day?: number,
 *   order?: number,
 *   color?: string,
 *   nearbyMinutes?: number,
 *   nearbyLoading?: boolean,
 *   nearbyActive?: boolean,
 *   onToggleNearby?: () => void,
 * }} props
 */
export default function PlanPointPopup({
  title,
  description,
  category,
  day,
  order,
  color,
  nearbyMinutes = 15,
  nearbyLoading = false,
  nearbyActive = false,
  onToggleNearby,
}) {
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

      {/* O texto diz o RAIO, não a feature: "Ver em 15 min a pe" responde a
          pergunta do usuario sozinho, enquanto "O que tem por perto" ainda
          deixa em aberto o quao perto. Com a area no ar o mesmo botao a
          esconde, que e o caminho de volta mais curto de dentro do popup. */}
      {!!onToggleNearby && (
        <Pressable
          onPress={onToggleNearby}
          disabled={nearbyLoading}
          accessibilityRole="button"
          accessibilityState={{ busy: nearbyLoading, selected: nearbyActive }}
          style={({ pressed }) => [
            styles.nearbyButton,
            nearbyActive && styles.nearbyButtonActive,
            pressed && styles.nearbyButtonPressed,
            nearbyLoading && styles.nearbyButtonDisabled,
          ]}
        >
          {nearbyLoading ? (
            <ActivityIndicator size="small" color={ISOCHRONE_COLOR} />
          ) : (
            <Text style={styles.nearbyIcon}>{nearbyActive ? '✕' : '🚶'}</Text>
          )}
          <Text style={styles.nearbyText} numberOfLines={1}>
            {nearbyLoading
              ? 'Calculando...'
              : nearbyActive
                ? 'Ocultar area'
                : `Ver em ${nearbyMinutes} min a pe`}
          </Text>
        </Pressable>
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
  nearbyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,209,193,0.45)',
    backgroundColor: 'rgba(0,209,193,0.12)',
    // A altura nao pode variar entre os tres estados (parado, carregando,
    // ativo): o popup do MapLibre se reposiciona quando o conteudo muda de
    // tamanho, e o cartao pularia embaixo do dedo no meio do toque.
    minHeight: 32,
  },
  nearbyButtonActive: {
    backgroundColor: 'rgba(0,209,193,0.22)',
    borderColor: 'rgba(0,209,193,0.75)',
  },
  nearbyButtonPressed: { opacity: 0.7 },
  nearbyButtonDisabled: { opacity: 0.8 },
  nearbyIcon: { fontSize: 12, lineHeight: 16 },
  nearbyText: {
    color: ISOCHRONE_COLOR,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    fontWeight: '700',
  },
});
