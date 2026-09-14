// "Usuários bloqueados": a única tela onde quem foi bloqueado volta a aparecer.
//
// Ela existe porque bloquear é reversível e o app precisa oferecer o caminho de
// volta — sem isso, desbloquear seria impossível: a pessoa some de todas as
// buscas e do próprio perfil, então não há onde tocar para desfazer.
//
// A lista NÃO vem de `profiles`: a policy esconde exatamente quem está
// bloqueado, e o join voltaria vazio em toda linha. Vem de
// `get_blocked_profiles`, uma função estreita que devolve só os perfis que o
// próprio solicitante bloqueou (ver 20260914183000_blocked_profiles.sql).
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { confirm, notify } from '../../utils/dialogs';
import { getBlockedUsers, unblockUser } from '../../services/moderationService';

export default function BlockedUsersScreen({ navigation }) {
  const [bloqueados, setBloqueados] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [desbloqueando, setDesbloqueando] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const resultado = await getBlockedUsers();
    setBloqueados(resultado.data);
    setCarregando(false);
  }, []);

  // `useFocusEffect` e não `useEffect`: quem bloqueia alguém de outra tela e
  // volta para cá precisa ver a lista atualizada.
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const desbloquear = async (item) => {
    const nome = item.display_name || (item.username ? `@${item.username}` : 'esta pessoa');

    const aceitou = await confirm(
      'Desbloquear',
      `${nome} volta a ver seu perfil e seu conteúdo, e você volta a ver o dela.\n\n`
      + 'Vocês NÃO voltam a se seguir — se quiserem, é só seguir de novo.'
    );
    if (!aceitou) return;

    setDesbloqueando(item.blocked_id);
    const resultado = await unblockUser(item.blocked_id);
    setDesbloqueando(null);

    if (!resultado.success) {
      notify('Não foi possível desbloquear', resultado.error || 'Tente novamente em instantes.');
      return;
    }

    // Tira da lista na hora em vez de recarregar: a linha desaparecer no toque é
    // a confirmação que a pessoa precisa, e uma ida ao banco a mais só atrasaria.
    setBloqueados((atual) => atual.filter((b) => b.blocked_id !== item.blocked_id));
  };

  const renderItem = ({ item }) => {
    const nome = item.display_name || item.username || 'Usuário removido';
    const inicial = (item.display_name?.[0] || item.username?.[0] || '?').toUpperCase();

    return (
      <View style={styles.row}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{inicial}</Text>
          </View>
        )}

        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>{nome}</Text>
          {!!item.username && <Text style={styles.rowHandle}>@{item.username}</Text>}
        </View>

        <TouchableOpacity
          style={styles.unblockBtn}
          onPress={() => desbloquear(item)}
          disabled={desbloqueando === item.blocked_id}
          accessibilityRole="button"
          accessibilityLabel={`Desbloquear ${nome}`}
        >
          {desbloqueando === item.blocked_id
            ? <ActivityIndicator size="small" color="#A78BFA" />
            : <Text style={styles.unblockText}>Desbloquear</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Usuários bloqueados</Text>
        <View style={styles.backBtn} />
      </View>

      {carregando ? (
        <View style={styles.center}>
          <ActivityIndicator color="#6C2BD9" />
        </View>
      ) : bloqueados.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={38} color="#3A4166" />
          <Text style={styles.emptyTitle}>Ninguém bloqueado</Text>
          <Text style={styles.emptyText}>
            Quando você bloquear alguém, essa pessoa aparece aqui e você pode desfazer quando quiser.
          </Text>
        </View>
      ) : (
        <FlatList
          data={bloqueados}
          keyExtractor={(item) => item.blocked_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1326' },
  header: {
    backgroundColor: '#0D1326',
    paddingHorizontal: 12,
    paddingTop: 48,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', fontFamily: 'Poppins_600SemiBold', color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { color: '#D6DAEA', fontSize: 15, fontWeight: '600', marginTop: 4 },
  emptyText: { color: '#5A6180', fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  listContent: { paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1B2646' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#A78BFA', fontSize: 16, fontWeight: '700' },
  rowText: { flex: 1 },
  rowName: { color: '#F7F7F2', fontSize: 14, fontWeight: '600' },
  rowHandle: { color: '#5A6180', fontSize: 12, marginTop: 1 },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A78BFA',
    minWidth: 104,
    alignItems: 'center',
  },
  unblockText: { color: '#A78BFA', fontSize: 12.5, fontWeight: '600' },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 70 },
});
