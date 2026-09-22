// Quem esta nesta viagem — e, para quem organiza, o que da para fazer a respeito.
//
// A Fase 1 deixou este componente como uma lista de leitura, de proposito: nao
// havia convite nem papel para mudar. A Fase 2 acrescenta as acoes, e o formato
// nao mudou porque ele ja nasceu lendo uma LISTA com papel e status em cada
// linha — era exatamente esse o plano.
//
// O QUE ESTE COMPONENTE NAO DECIDE
//
// Ele nao decide quem pode o que. Isso vem pronto em `abilities`
// (utils/tripPermissions), e a razao esta la: a regra espalhada por tela diverge,
// e divergencia aqui aparece como botao que falha na cara do usuario. Aqui so se
// pergunta "posso?" e se desenha de acordo.
//
// E ele nao e seguranca. A RLS do Postgres recusa a escrita de um viewer mesmo
// que esta tela ofereca o botao; esconder o botao e HONESTIDADE DE INTERFACE, nao
// bloqueio.
//
// Componente React Native puro: o mesmo arquivo nas tres plataformas.
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MemberAvatar from './MemberAvatar';
import MemberActionsMenu from './MemberActionsMenu';
import { setTripMemberRole, removeTripMember } from '../../services/tripMemberService';
import { ROLE_LABEL } from '../../utils/tripPermissions';
import { confirm, notify } from '../../utils/dialogs';
import { trip, font, shadow, radius } from '../../theme/tripCollab';

/**
 * A cor do pontinho de cada papel.
 *
 * PONTO DE COR, E NAO BADGE COLORIDO CHEIO: numa lista de seis pessoas, seis
 * retangulos coloridos competem entre si e com o avatar — o olho nao sabe onde
 * pousar. O ponto informa o papel para quem procura e desaparece para quem so
 * quer saber quem esta na viagem.
 *
 * O organizador nao tem ponto: ele tem o selo dourado no avatar e o papel escrito
 * em dourado. Dois sinais para a mesma coisa bastam; tres viram enfeite.
 */
const ROLE_DOT = {
  editor: trip.d2,
  viewer: trip.inkFaint,
};

/**
 * @param {{
 *   members?: Array<{ id: string, role?: string, status?: string, profile?: any }>,
 *   loading?: boolean,
 *   tripId?: string | null,
 *   currentUserId?: string | null,
 *   abilities?: { canInvite?: boolean, canManageMembers?: boolean, canChangeRole?: boolean },
 *   onInvite?: () => void,
 *   onChanged?: () => void,
 * }} props
 */
export default function TripTravelers({
  members = [],
  loading = false,
  tripId = null,
  currentUserId = null,
  abilities = {},
  onInvite,
  onChanged,
}) {
  // Qual menu esta aberto, e onde ancora-lo. Guardar o retangulo medido (e nao
  // so o id) e o que permite o menu abrir junto do avatar daquela pessoa.
  const [menu, setMenu] = useState(/** @type {{ member: any, anchor: any } | null} */ (null));
  const [busyId, setBusyId] = useState(/** @type {string | null} */ (null));

  const abrirMenu = useCallback((member, event) => {
    const alvo = event?.currentTarget;
    if (!alvo?.measureInWindow) {
      setMenu({ member, anchor: null });
      return;
    }
    // `measureInWindow` existe no RN e no react-native-web, e devolve a posicao
    // na JANELA — que e o sistema de coordenadas do Modal. `measure` (relativo
    // ao pai) abriria o menu no lugar errado dentro de um ScrollView rolado.
    alvo.measureInWindow((x, y, width, height) => {
      setMenu({ member, anchor: { x, y, width, height } });
    });
  }, []);

  const executar = useCallback(async (member, acao) => {
    setBusyId(member.id);
    const resultado = await acao();
    setBusyId(null);

    if (!resultado?.success) {
      // A mensagem vem do banco quando ele tem uma ("Voce e o unico
      // organizador..."), e o servico garante que exista alguma. Ver
      // tripMemberService.
      notify('Não deu certo', resultado?.error || 'Tente de novo em instantes.');
      return;
    }
    onChanged?.();
  }, [onChanged]);

  const acoesPara = useCallback((member) => {
    const nome = member.profile?.display_name || member.profile?.username || 'esta pessoa';
    /** @type {Array<any>} */
    const acoes = [];

    if (abilities.canChangeRole && member.status === 'accepted') {
      // Viewer ganha edicao; editor perde. O rotulo diz o que VAI ACONTECER, nao
      // o estado atual — "Permitir edição" e um verbo, e e o que a pessoa quer
      // fazer.
      if (member.role === 'viewer') {
        acoes.push({
          key: 'allow-edit',
          label: 'Permitir edição',
          icon: 'create-outline',
          color: trip.d2,
          onPress: () => executar(member, () => setTripMemberRole({
            tripId, userId: member.id, role: 'editor',
          })),
        });
      } else if (member.role === 'editor') {
        acoes.push({
          key: 'only-view',
          label: 'Deixar só visualizar',
          icon: 'eye-outline',
          color: trip.inkDim,
          onPress: () => executar(member, () => setTripMemberRole({
            tripId, userId: member.id, role: 'viewer',
          })),
        });
      }

      if (member.role !== 'owner') {
        acoes.push({
          key: 'promote',
          label: 'Tornar organizador',
          icon: 'star',
          color: trip.gold,
          onPress: async () => {
            // Promover é irreversivel POR QUEM PROMOVE: o novo organizador tem
            // exatamente o mesmo poder, inclusive o de rebaixar quem o promoveu.
            // Confirmar aqui e barato; descobrir depois, nao.
            const ok = await confirm(
              'Tornar organizador?',
              `${nome} poderá convidar, remover participantes e excluir a viagem — `
              + 'as mesmas coisas que você pode.'
            );
            if (ok) {
              executar(member, () => setTripMemberRole({ tripId, userId: member.id, role: 'owner' }));
            }
          },
        });
      }
    }

    if (abilities.canManageMembers && member.id !== currentUserId) {
      const pendente = member.status === 'pending';
      acoes.push({
        key: 'remove',
        // Convite ainda nao aceito nao e "remover da viagem" — a pessoa nunca
        // entrou. Chamar as duas coisas pelo mesmo nome faria o organizador
        // hesitar antes de desfazer um convite mandado por engano.
        label: pendente ? 'Cancelar convite' : 'Remover da viagem',
        icon: 'close',
        destructive: true,
        color: trip.d1,
        onPress: async () => {
          const ok = await confirm(
            pendente ? 'Cancelar convite?' : 'Remover da viagem?',
            pendente
              ? `${nome} não poderá mais entrar por este convite.`
              : `${nome} perde o acesso ao roteiro. O que já foi editado continua na viagem.`
          );
          if (ok) executar(member, () => removeTripMember({ tripId, userId: member.id }));
        },
      });
    }

    return acoes;
  }, [abilities, currentUserId, executar, tripId]);

  // Sem ninguem e sem carregar nao ha o que dizer: acontece no roteiro que ainda
  // nao foi salvo, onde a viagem existe so na tela.
  if (!loading && !members.length) return null;

  const aceitos = members.filter((m) => m.status === 'accepted').length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Participantes</Text>
          <Text style={styles.subtitle}>
            {aceitos === 1 ? '1 pessoa nesta viagem' : `${aceitos} pessoas nesta viagem`}
            {members.length > aceitos ? ` · ${members.length - aceitos} convidada(s)` : ''}
          </Text>
        </View>

        {abilities.canInvite && onInvite ? (
          <TouchableOpacity
            onPress={onInvite}
            style={styles.inviteButton}
            accessibilityRole="button"
            accessibilityLabel="Convidar pessoas"
          >
            <Ionicons name="person-add" size={17} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && !members.length ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={trip.inkDim} />
          <Text style={styles.loadingText}>Carregando…</Text>
        </View>
      ) : null}

      {members.map((member) => {
        const pendente = member.status === 'pending';
        const dono = member.role === 'owner';
        const eu = member.id === currentUserId;
        const acoes = acoesPara(member);
        const ocupado = busyId === member.id;

        return (
          <View
            key={member.id}
            style={[
              styles.row,
              dono && styles.rowOwner,
              // Opacidade reduzida para convite pendente: a pessoa esta na lista
              // (o organizador precisa lembrar que convidou) sem parecer que ja
              // participa.
              pendente && styles.rowPending,
            ]}
          >
            <MemberAvatar
              person={{ ...(member.profile || {}), id: member.id, role: member.role }}
              size={46}
              sealBorderColor={trip.card}
            />

            <View style={styles.rowText}>
              <View style={styles.nameLine}>
                <Text style={styles.name} numberOfLines={1}>
                  {member.profile?.display_name || member.profile?.username || 'Viajante'}
                </Text>
                {eu ? <Text style={styles.you}>(você)</Text> : null}
              </View>

              {pendente ? (
                <Text style={styles.pending}>Convite enviado · aguardando</Text>
              ) : dono ? (
                // Organizador: papel escrito em dourado, sem ponto. O selo no
                // avatar ja e o sinal forte.
                <Text style={styles.ownerRole}>{ROLE_LABEL.owner}</Text>
              ) : (
                <View style={styles.roleLine}>
                  <View style={[styles.dot, { backgroundColor: ROLE_DOT[member.role] || trip.inkFaint }]} />
                  <Text style={styles.role}>{ROLE_LABEL[member.role] || ROLE_LABEL.viewer}</Text>
                </View>
              )}
            </View>

            {ocupado ? (
              <ActivityIndicator size="small" color={trip.inkDim} />
            ) : acoes.length ? (
              <TouchableOpacity
                onPress={(event) => abrirMenu(member, event)}
                style={styles.moreButton}
                accessibilityRole="button"
                accessibilityLabel={`Ações para ${member.profile?.display_name || 'participante'}`}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="ellipsis-vertical" size={16} color={trip.inkDim} />
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}

      <MemberActionsMenu
        visible={Boolean(menu)}
        anchor={menu?.anchor}
        actions={menu ? acoesPara(menu.member) : []}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
    backgroundColor: 'rgba(22,31,56,0.94)',
    borderWidth: 1,
    borderColor: trip.line,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    color: trip.ink,
    fontFamily: font.title,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  subtitle: {
    color: trip.inkDim,
    fontFamily: font.body,
    fontSize: 12,
    marginTop: 1,
  },
  inviteButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: trip.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.accentButton,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.row,
    backgroundColor: trip.card,
    borderWidth: 1,
    borderColor: trip.line,
  },
  // Sombra suave em vez de borda lateral colorida, como pede a direcao visual.
  rowOwner: { borderColor: 'rgba(233,185,73,0.28)' },
  rowPending: { opacity: 0.5 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    color: trip.ink,
    fontFamily: font.name,
    fontSize: 14.5,
    flexShrink: 1,
  },
  you: { color: trip.inkFaint, fontFamily: font.body, fontSize: 12 },
  ownerRole: {
    color: trip.gold,
    fontFamily: font.bodySemi,
    fontSize: 12,
  },
  roleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  role: { color: trip.inkDim, fontFamily: font.body, fontSize: 12 },
  pending: { color: trip.inkDim, fontFamily: font.body, fontSize: 12 },
  moreButton: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: trip.inkDim, fontFamily: font.body, fontSize: 12 },
});
