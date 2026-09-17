// Uma viagem na lista "Minhas viagens".
//
// MESMA LINGUAGEM DA CAPA, OUTRA ALTURA. O cartão repete o que a tela da viagem
// mostra — foto de fundo, nome dos destinos, os chips de metadados — porque é
// isso que faz a lista e a tela parecerem o mesmo produto. O que não se repete é
// o tamanho: a capa da tela tem 260px e ocupa meia tela de propósito; aqui são
// 150px, para caberem três ou quatro viagens numa rolada. Uma lista em que cada
// item ocupa a tela inteira não é uma lista, é um carrossel.
//
// Os chips ficam DENTRO do cartão, sobre a foto, e não flutuando na borda como
// na tela da viagem: num cartão de 150px a sobreposição não teria para onde ir.
//
// Componente React Native puro: o mesmo arquivo nas três plataformas.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/**
 * @param {{
 *   title: string,
 *   photoUrl?: string | null,
 *   chips?: Array<{ id: string, icon: any, label: string }>,
 *   appliedToMap?: boolean,
 *   onPress?: () => void,
 *   onLongPress?: () => void,
 * }} props
 */
export default function TripListCard({
  title,
  photoUrl = null,
  chips = [],
  appliedToMap = false,
  onPress,
  onLongPress,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Abrir viagem ${title}`}
      style={styles.card}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : null}

      <LinearGradient
        colors={['rgba(13,19,38,0.25)', 'rgba(13,19,38,0.55)', 'rgba(13,19,38,0.95)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {appliedToMap ? (
        <View style={styles.badge}>
          <Ionicons name="earth" size={11} color="#FFFFFF" />
          <Text style={styles.badgeText}>No globo</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        {/* Duas linhas no máximo: "Itália, Croácia e Eslováquia" cabe em duas, e
            o que passar disso já está abreviado na origem (destinationTitle). */}
        <Text style={styles.title} numberOfLines={2}>{title}</Text>

        {chips.length ? (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <View key={chip.id} style={styles.chip}>
                <Ionicons name={chip.icon} size={11} color="#C3C9E0" />
                <Text style={styles.chipText} numberOfLines={1}>{chip.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 150,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: '#0D1326',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 11,
    backgroundColor: 'rgba(108,43,217,0.9)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: { padding: 14, gap: 8 },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 23,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(13,19,38,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  chipText: {
    color: '#C3C9E0',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    fontWeight: '600',
  },
});
