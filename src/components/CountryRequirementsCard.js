import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFallbackTravelRequirements } from '../services/travelRequirementsService';

export default function CountryRequirementsCard({ countryCode, light = false }) {
  const requirements = getFallbackTravelRequirements(countryCode);
  const palette = light
    ? { card: '#FFFFFF', title: '#111827', text: '#596174', border: '#E5E7EB' }
    : { card: '#171D36', title: '#F7F7F2', text: '#A5ACC8', border: 'rgba(255,255,255,0.08)' };

  return (
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
      <View style={styles.heading}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#8B5CF6" />
        <Text style={[styles.headingText, { color: palette.title }]}>Entrada e saúde — {requirements.countryName}</Text>
      </View>
      <View style={styles.item}>
        <Ionicons name="document-text-outline" size={17} color="#A78BFA" />
        <View style={styles.itemText}>
          <Text style={[styles.label, { color: palette.title }]}>Documentos e autorizações</Text>
          <Text style={[styles.description, { color: palette.text }]}>{requirements.documents}</Text>
        </View>
      </View>
      <View style={styles.item}>
        <Ionicons name="medical-outline" size={17} color="#35D3C8" />
        <View style={styles.itemText}>
          <Text style={[styles.label, { color: palette.title }]}>Vacinas e saúde</Text>
          <Text style={[styles.description, { color: palette.text }]}>{requirements.health}</Text>
        </View>
      </View>
      <Text style={[styles.disclaimer, { color: palette.text }]}>Regras mudam. Confirme nas fontes oficiais antes de comprar ou embarcar.</Text>
      <View style={styles.links}>
        <TouchableOpacity onPress={() => Linking.openURL(requirements.documentsUrl)}>
          <Text style={styles.link}>{requirements.documentsSourceLabel}</Text>
        </TouchableOpacity>
        <Text style={{ color: palette.text }}>•</Text>
        <TouchableOpacity onPress={() => Linking.openURL(requirements.healthUrl)}>
          <Text style={styles.link}>{requirements.healthSourceLabel}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.updatedAt, { color: palette.text }]}>Referências revisadas em {requirements.updatedAt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 13 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headingText: { flex: 1, fontSize: 15, fontWeight: '900' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemText: { flex: 1 },
  label: { fontSize: 12, fontWeight: '800', marginBottom: 3 },
  description: { fontSize: 11, lineHeight: 17 },
  disclaimer: { fontSize: 9, lineHeight: 14 },
  links: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  link: { color: '#7C3AED', fontSize: 10, fontWeight: '800', textDecorationLine: 'underline' },
  updatedAt: { fontSize: 9 },
});
