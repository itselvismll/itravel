// A tag discreta "editado por X" no cartão de uma parada.
//
// Toda a decisão (aparece? com que nome?) está em `utils/activityAttribution`;
// aqui só a pintura, no mesmo arranjo do MemberAvatar.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MemberAvatar from './MemberAvatar';
import { trip, font } from '../../theme/tripCollab';

/**
 * @param {{
 *   tag: { person: any, label: string } | null,
 * }} props
 */
export default function ActivityEditedTag({ tag }) {
  if (!tag) return null;

  return (
    <View style={styles.tag} accessibilityLabel={tag.label}>
      {/* Sem o selo de organizador: num avatar de 16px ele vira um borrão
          dourado, e o papel da pessoa não é o assunto desta tag. */}
      <MemberAvatar person={tag.person} size={16} showOwnerSeal={false} />
      <Text style={styles.label} numberOfLines={1}>{tag.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 9,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: trip.line,
  },
  label: {
    color: trip.inkDim,
    fontFamily: font.body,
    fontSize: 10,
  },
});
