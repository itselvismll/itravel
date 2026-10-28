// A barra de atalhos da viagem: Roteiro · Orçamento · Checklist · Dicas ·
// Ajustar.
//
// SÃO AS MESMAS ABAS DE SEMPRE. O que mudou é só a apresentação: elas eram uma
// fileira rolável de pills com ícone e texto lado a lado, e viraram um cartão
// fixo com cinco colunas de mesma largura, ícone sobre rótulo, separadas por
// divisórias finas. Nenhum comportamento mudou — mesma lista, mesmo callback,
// mesma aba ativa.
//
// Por que fixo e não rolável: são cinco itens, e cinco colunas cabem numa tela
// de 360px. Rolagem aqui esconderia "Ajustar" atrás de um gesto que nada
// anuncia — o mesmo erro que o seletor de dia do mapa já cometeu duas vezes.
//
// Componente React Native puro: o mesmo arquivo nas três plataformas.
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ACTIVE = '#A78BFA';
const IDLE = '#8B93AD';

/**
 * @param {{
 *   items: Array<{ id: string, label: string, icon: any }>,
 *   activeId: string,
 *   onSelect: (id: string) => void,
 *   style?: any,
 * }} props
 */
export default function TripShortcutBar({ items, activeId, onSelect, style }) {
  if (!items?.length) return null;

  return (
    <View style={[styles.bar, style]}>
      {items.map((item, index) => {
        const active = item.id === activeId;
        return (
          <React.Fragment key={item.id}>
            {index > 0 ? <View style={styles.divider} /> : null}

            <TouchableOpacity
              onPress={() => onSelect(item.id)}
              activeOpacity={0.75}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={styles.item}
            >
              <Ionicons name={item.icon} size={19} color={active ? ACTIVE : IDLE} />
              <Text
                style={[styles.label, active && styles.labelActive]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 18,
    backgroundColor: '#161F38',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  // Fio de 1px entre as colunas. A margem vertical o encolhe: encostado nas
  // bordas do cartão ele leria como uma grade, e o que se quer é só a separação.
  divider: {
    width: 1,
    marginVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  label: {
    color: IDLE,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 10.5,
    fontWeight: '600',
  },
  labelActive: { color: ACTIVE },
});
