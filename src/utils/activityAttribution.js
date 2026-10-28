// "Editado por X" no cartão de uma parada do roteiro.
//
// Módulo PURO — sem React, sem Supabase. Quem decide se a tag aparece e o que
// ela diz é esta função; o componente (components/trip/ActivityEditedTag) só
// pinta. É o que deixa o `node:test` afirmar a regra sem browser.
//
// DE ONDE VÊM OS DADOS
//
// `createdBy`, `lastEditedBy` e `lastEditedAt` são escritos SÓ pelo banco (trigger
// stamp_trip_activity_authorship, migração 20260923120000), com `auth.uid()`. O
// app não manda autoria nenhuma — lê. E "editou" lá quer dizer que o CONTEÚDO da
// parada mudou: salvar sem mexer, ou a parada só subir uma posição porque a de
// cima foi apagada, não carimba ninguém.

import { shortPersonName } from './personName';

/**
 * A tag de autoria da parada, ou `null` quando ela não deve aparecer.
 *
 * APARECE PARA QUALQUER EDIÇÃO DEPOIS DA CRIAÇÃO — inclusive a de quem criou —,
 * desde que a viagem seja compartilhada. A primeira versão só mostrava a tag
 * quando o editor era outra pessoa, e isso a escondia justamente no caso mais
 * comum: o organizador mexendo no roteiro que a IA gerou na conta dele (o
 * backfill de 20260923120000 atribuiu a ele todas as paradas antigas). Os outros
 * recebiam "fulano editou a viagem" e não achavam em lugar nenhum O QUE mudou.
 *
 * VIAGEM DE UMA PESSOA SÓ NÃO TEM TAG: ali toda edição é "editado por você", e a
 * tag só poluiria o roteiro. Conta quem está DENTRO da viagem (`accepted`);
 * convite pendente ainda não é participante.
 *
 * Também some quando quem editou não está mais na lista de participantes: sem o
 * perfil não há nome nem avatar, e uma tag "editado por alguém" não informa nada.
 *
 * @param {{ lastEditedBy?: string | null, lastEditedAt?: string | null } | null | undefined} activity
 * @param {Array<{ id: string, role?: string | null, status?: string | null, profile?: { username?: string | null, display_name?: string | null, avatar_url?: string | null } | null }>} members
 * @param {string | null} [currentUserId]
 * @returns {null | {
 *   person: { id: string, role: string | null, username: string | null, display_name: string | null, avatar_url: string | null },
 *   label: string,
 *   editedAt: string | null,
 * }}
 */
export const activityEditTag = (activity, members, currentUserId = null) => {
  // `last_edited_by` só existe depois de uma edição de conteúdo: o banco o deixa
  // nulo na criação (stamp_trip_activity_authorship). Nulo = nunca editada.
  const editor = activity?.lastEditedBy;
  if (!editor) return null;

  const lista = Array.isArray(members) ? members : [];
  // Sem `status` (lista antiga) conta como dentro — errar para mostrar a tag é
  // melhor do que escondê-la de uma viagem compartilhada.
  const participantes = lista.filter((item) => !item?.status || item.status === 'accepted');
  if (participantes.length < 2) return null;

  const member = lista.find((item) => item?.id === editor);
  if (!member) return null;

  const nome = editor === currentUserId ? 'você' : shortPersonName(member.profile);
  if (!nome) return null;

  return {
    person: {
      id: member.id,
      role: member.role ?? null,
      username: member.profile?.username ?? null,
      display_name: member.profile?.display_name ?? null,
      avatar_url: member.profile?.avatar_url ?? null,
    },
    label: `editado por ${nome}`,
    editedAt: activity?.lastEditedAt ?? null,
  };
};
