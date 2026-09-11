import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFallbackTravelRequirements } from '../services/travelRequirementsService';

// Cores do indicador. O "revisado" é verde-água discreto e o "geral" é âmbar:
// âmbar porque é um aviso de que falta confirmação, e não um erro — vermelho
// aqui leria como "este país é perigoso", que não é o que se está dizendo.
const VERIFIED_COLOR = '#0E9F8E';
const GENERIC_COLOR = '#B45309';

/**
 * Diz de onde veio o texto logo abaixo dele.
 *
 * Antes desta correção o card não fazia distinção nenhuma: o parágrafo genérico
 * que 195 países recebem tinha exatamente a mesma aparência do texto revisado à
 * mão para os 41 — o leitor não tinha como saber que estava lendo um texto que
 * não fala do país dele. O dado já existia (`verified`), calculado e nunca
 * mostrado.
 */
function SourceBadge({ verified, palette }) {
  const color = verified ? VERIFIED_COLOR : GENERIC_COLOR;

  return (
    <View style={styles.badgeRow}>
      <Ionicons
        name={verified ? 'checkmark-circle' : 'alert-circle-outline'}
        size={12}
        color={color}
      />
      <Text style={[styles.badgeText, { color }]}>
        {verified
          ? 'Informação específica revisada'
          : 'Informação geral — confirme na fonte oficial'}
      </Text>
    </View>
  );
}

export default function CountryRequirementsCard({ countryCode, light = false }) {
  const requirements = getFallbackTravelRequirements(countryCode);
  const palette = light
    ? { card: '#FFFFFF', title: '#111827', text: '#596174', border: '#E5E7EB' }
    : { card: '#171D36', title: '#F7F7F2', text: '#A5ACC8', border: 'rgba(255,255,255,0.08)' };

  return (
    <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.heading}>
        <Ionicons name="shield-checkmark-outline" size={19} color="#8B5CF6" />
        <Text style={[styles.headingText, { color: palette.title }]}>
          {requirements.identified
            ? `Entrada e saúde — ${requirements.countryName}`
            : 'Entrada e saúde'}
        </Text>
      </View>
      <View style={styles.item}>
        <Ionicons name="document-text-outline" size={17} color="#A78BFA" />
        <View style={styles.itemText}>
          <Text style={[styles.label, { color: palette.title }]}>Documentos e autorizações</Text>
          <Text style={[styles.description, { color: palette.text }]}>{requirements.documents}</Text>
          <SourceBadge verified={requirements.documentsVerified} palette={palette} />
        </View>
      </View>
      <View style={styles.item}>
        <Ionicons name="medical-outline" size={17} color="#35D3C8" />
        <View style={styles.itemText}>
          <Text style={[styles.label, { color: palette.title }]}>Vacinas e saúde</Text>
          <Text style={[styles.description, { color: palette.text }]}>{requirements.health}</Text>
          <SourceBadge verified={requirements.healthVerified} palette={palette} />
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
      {/* "Referências revisadas em {data}" sugeria que as FONTES tinham sido
          conferidas naquela data. A data é estática, igual para todos os países
          e não mudou desde que o arquivo nasceu — ela diz quando a equipe
          escreveu estes textos, e nada sobre a atualidade da regra oficial. O
          rótulo agora diz exatamente isso, e a segunda metade da frase é o que
          o usuário precisa fazer a respeito. */}
      <Text style={[styles.updatedAt, { color: palette.text }]}>
        Texto revisado pela equipe em {requirements.reviewedAt} — a regra oficial pode ter mudado
        depois. Confirme sempre na fonte acima.
      </Text>
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
  updatedAt: { fontSize: 9, lineHeight: 13 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  badgeText: { fontSize: 9, fontWeight: '800' },
});
