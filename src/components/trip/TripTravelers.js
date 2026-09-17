// Quem está nesta viagem.
//
// HOJE É UMA LINHA SÓ — você, como dono. E é de propósito: a Fase 1 é a camada
// visual sobre a fundação que a Fase 0 criou, sem convite e sem edição
// compartilhada. O componente já lê uma LISTA (não um usuário), já mostra o
// papel de cada um e já ordena dono primeiro, porque é exatamente isso que ele
// vai fazer quando o convite existir — e trocar o formato depois custaria mexer
// na tela de novo.
//
// Sem botão de convidar: ele abriria um fluxo que ainda não existe.
//
// Componente React Native puro: o mesmo arquivo nas três plataformas.
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import Avatar from '../Avatar';

/** Como cada papel é chamado na tela. */
const ROLE_LABEL = {
  owner: 'Organizador',
  editor: 'Pode editar',
  viewer: 'Só visualiza',
};

/**
 * @param {{
 *   members?: Array<{ id: string, role?: string, status?: string, profile?: any }>,
 *   loading?: boolean,
 * }} props
 */
export default function TripTravelers({ members = [], loading = false }) {
  // Sem ninguém e sem carregar não há o que dizer: acontece no roteiro que ainda
  // não foi salvo, onde a viagem existe só na tela.
  if (!loading && !members.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {members.length === 1 ? 'Viajante' : `Viajantes · ${members.length}`}
      </Text>

      {loading && !members.length ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color="#8D95B4" />
          <Text style={styles.pending}>Carregando…</Text>
        </View>
      ) : null}

      {members.map((member) => (
        <View key={member.id} style={styles.row}>
          <Avatar profile={member.profile} size={34} />
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>
              {member.profile?.display_name || member.profile?.username || 'Viajante'}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {ROLE_LABEL[member.role] || ROLE_LABEL.viewer}
              {/* Convite enviado e não respondido. Hoje não acontece — não há
                  como convidar —, mas a linha já sabe dizer. */}
              {member.status === 'pending' ? ' · convite pendente' : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    gap: 10,
    backgroundColor: 'rgba(22,31,56,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#8D95B4',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, gap: 2 },
  name: {
    color: '#F7F7F2',
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13,
    fontWeight: '600',
  },
  role: {
    color: '#7F87A6',
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
  },
  pending: {
    color: '#7F87A6',
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
});
