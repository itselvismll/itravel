// O badge de Instagram do perfil: ícone + @, tocável, abre o perfil da pessoa.
//
// Um componente só, usado pelo ProfileScreen e pelo PublicProfileScreen, pelo
// mesmo motivo que o TravelerLevelCard passou a ser dono do próprio fundo: dois
// badges independentes em duas telas divergem em silêncio, e ninguém abre as
// duas lado a lado para comparar.
//
// Devolve `null` quando não há @ — o campo é opcional, e deixar a decisão aqui
// evita que cada tela repita o mesmo `{profile?.instagram_username && ...}` com
// uma condição ligeiramente diferente.
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { normalizeInstagramUsername, openInstagramProfile } from '../../utils/instagram';

/**
 * @param {{
 *   username?: string | null,
 *   style?: import('react-native').StyleProp<import('react-native').ViewStyle>,
 * }} props
 */
export default function InstagramBadge({ username, style }) {
  // Normaliza na LEITURA também, e não só ao gravar: perfis criados antes desta
  // tela, ou editados direto pelo PostgREST, podem ter um valor sujo no banco, e
  // um @ com barra viraria um deep link quebrado ao toque.
  const handle = normalizeInstagramUsername(username);
  if (!handle) return null;

  return (
    <Pressable
      onPress={() => openInstagramProfile(handle)}
      accessibilityRole="link"
      accessibilityLabel={`Abrir @${handle} no Instagram`}
      style={({ pressed }) => [styles.badge, style, pressed && styles.pressed]}
      // O badge é pequeno e fica numa linha cheia de outros elementos: sem
      // hitSlop, o alvo de toque fica abaixo do mínimo confortável.
      hitSlop={8}
    >
      <Ionicons name="logo-instagram" size={13} color="#F7F7F2" />
      <Text style={styles.texto} numberOfLines={1}>@{handle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Mesma forma de pill do resto da UI de perfil: cantos totalmente
  // arredondados, ícone à esquerda, texto curto.
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#6C2BD9',
    maxWidth: '100%',
  },
  pressed: { opacity: 0.7 },
  texto: { color: '#F7F7F2', fontSize: 11, fontWeight: '700', flexShrink: 1 },
});
