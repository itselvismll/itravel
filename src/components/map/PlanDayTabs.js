// Seletor de dia do roteiro no globo.
//
// Um roteiro de uma semana coloca sete trajetos sobrepostos na mesma cidade, e
// as cores por dia só resolvem até certo ponto — no centro, onde as paradas se
// concentram, tudo vira um novelo. Isolar um dia é o que devolve a leitura.
//
// "Todos" é o estado inicial de propósito: a primeira coisa a ver é a forma da
// viagem inteira. O recorte por dia vem depois, quando já se sabe o que se está
// olhando.
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { dayColor } from './planRoute';

/**
 * @param {{
 *   days: number[],
 *   selectedDay: number | null,
 *   onSelect: (day: number | null) => void,
 *   style?: any,
 * }} props
 */
export default function PlanDayTabs({ days, selectedDay, onSelect, style }) {
  // Um dia só não é escolha: a aba seria um botão que não faz nada.
  if (!days?.length || days.length < 2) return null;

  return (
    <View style={[styles.container, style]} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <TouchableOpacity
          onPress={() => onSelect(null)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedDay === null }}
          accessibilityLabel="Mostrar todos os dias do roteiro"
          style={[styles.chip, selectedDay === null && styles.chipActive]}
        >
          <Text style={[styles.label, selectedDay === null && styles.labelActive]}>Todos</Text>
        </TouchableOpacity>

        {days.map((day) => {
          const active = selectedDay === day;
          const color = dayColor(day);
          return (
            <TouchableOpacity
              key={day}
              onPress={() => onSelect(active ? null : day)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Mostrar apenas o dia ${day}`}
              style={[
                styles.chip,
                // A cor do dia é a MESMA da linha e dos pinos daquele dia no
                // mapa: é o que liga a aba ao trajeto sem precisar de legenda.
                active && { backgroundColor: color, borderColor: color },
                !active && { borderColor: color },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: active ? '#0D1326' : color }]} />
              <Text style={[styles.label, active && styles.labelActive]}>Dia {day}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, zIndex: 1001 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(13,19,38,0.85)',
  },
  chipActive: { backgroundColor: '#6C2BD9', borderColor: '#6C2BD9' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  labelActive: { color: '#FFFFFF' },
});
