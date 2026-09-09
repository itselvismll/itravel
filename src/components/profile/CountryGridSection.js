// Uma seção de países do perfil: título, grid de até nove etiquetas e o card
// "+N" que abre a lista completa.
//
// Serve o Passaporte, o Quero Visitar e a lista do perfil público. Não sabe qual
// deles está desenhando: os dados, o título, o ícone e a cor vêm de quem chama.
// É isso que faz as três seções pararem de ser JSX duplicado.
//
// A aritmética do corte vive em countryGridData.js, sem React — aqui é só o
// desenho.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CountryTag, { TAG_HEIGHT, TAG_WIDTH } from './CountryTag';
import CountryListModal from './CountryListModal';
import { GRID_LIMIT, countryKey, gridSlots, tagRotation } from './countryGridData';

/**
 * @param {{
 *   countries?: Array<any>,
 *   title: string,
 *   icon?: React.ComponentProps<typeof Ionicons>['name'],
 *   iconColor?: string,
 *   accentColor?: string,
 *   accentBorderColor?: string,
 *   emptyState?: { icon?: string, text?: string } | null,
 *   limit?: number,
 * }} props
 */
export default function CountryGridSection({
  countries = [],
  title,
  icon = 'book-outline',
  iconColor,
  accentColor,
  accentBorderColor,
  emptyState = null,
  limit = GRID_LIMIT,
}) {
  const [expanded, setExpanded] = useState(false);
  const { visible, remaining, hasMore } = gridSlots(countries, limit);

  const isEmpty = !countries?.length;

  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <Ionicons name={icon} size={14} color={iconColor || accentColor || '#999'} />
        <Text style={[styles.cardTitle, !!accentColor && { color: accentColor }]}>
          {title}
        </Text>
      </View>

      {isEmpty && emptyState ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{emptyState.icon || '🧳'}</Text>
          <Text style={styles.emptyText}>{emptyState.text}</Text>
        </View>
      ) : (
        <View style={styles.stampsGrid}>
          {visible.map((country, index) => (
            <CountryTag
              key={countryKey(country, index)}
              country={country}
              rotation={tagRotation(index)}
              accentColor={accentColor}
              accentBorderColor={accentBorderColor}
            />
          ))}

          {hasMore && (
            <Pressable
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel={`Ver todos os ${countries.length} países`}
              style={({ pressed }) => [
                styles.moreTag,
                // A mesma rotação que a etiqueta ocuparia naquele slot: um card
                // reto no meio dos tortos leria como elemento de outro tipo
                // antes de o usuário chegar no texto.
                { transform: [{ rotate: `${tagRotation(visible.length)}deg` }] },
                !!accentColor && { borderColor: accentColor },
                pressed && styles.morePressed,
              ]}
            >
              <Text style={[styles.moreCount, !!accentColor && { color: accentColor }]}>
                +{remaining}
              </Text>
              <Text style={styles.moreLabel}>ver todos</Text>
            </Pressable>
          )}
        </View>
      )}

      <CountryListModal
        visible={expanded}
        onClose={() => setExpanded(false)}
        countries={countries}
        title={title}
        accentColor={accentColor}
        accentBorderColor={accentBorderColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 14,
    margin: 12,
    marginBottom: 0,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  stampsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 8,
    justifyContent: 'flex-start',
  },
  // Mesmas medidas da etiqueta, para o card cair no slot sem quebrar a grade.
  // O visual é o negativo dela: tracejado e vazado em vez de sólido, que é como
  // se lê "aqui tem mais" em vez de "aqui tem um país".
  moreTag: {
    width: TAG_WIDTH,
    height: TAG_HEIGHT,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C8BFA5',
    backgroundColor: 'rgba(243,236,220,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  morePressed: { opacity: 0.65 },
  moreCount: { fontSize: 16, fontWeight: '800', color: '#46371E' },
  moreLabel: { fontSize: 8, fontWeight: '700', color: '#8A7B5E', letterSpacing: 0.4 },
  empty: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: 12, color: '#bbb', textAlign: 'center', lineHeight: 18 },
});
