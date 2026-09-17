// Quem participa de uma viagem.
//
// A tabela `trip_members` existe desde a Fase 0 e hoje tem sempre uma linha por
// viagem: o dono. Este módulo é a leitura dela — e já devolve o formato que a
// lista de viajantes vai continuar consumindo quando houver convidados (Fase 2),
// para a tela não precisar mudar junto.
//
// REGRA DA CASA: nada aqui lança. A falha volta como lista vazia mais a
// mensagem, e a tela decide o que fazer. Uma viagem sem a lista de viajantes
// continua sendo uma viagem que abre.
import { supabase } from './supabase';

// `profiles!trip_members_user_id_fkey` e não `profiles`, porque trip_members tem
// DUAS chaves estrangeiras para profiles — `user_id` e `invited_by`. Sem dizer
// qual, o PostgREST recusa a consulta inteira com PGRST201 ("more than one
// relationship was found"), que é o mesmo erro que esvaziou a tela de roteiros
// salvos quando trip_activities nasceu com duas FKs para trip_days.
const MEMBER_SELECT = `
  user_id,
  role,
  status,
  joined_at,
  profiles!trip_members_user_id_fkey (username, display_name, avatar_url)
`;

/**
 * Os participantes de uma viagem, dono primeiro.
 *
 * @param {string | null} tripId
 * @returns {Promise<{ success: boolean, data: Array<any>, error?: string }>}
 */
export const getTripMembers = async (tripId) => {
  // Roteiro recém-gerado ainda não foi salvo, e roteiro `local-` nunca existiu
  // no banco: nos dois casos não há participante para buscar, e uma consulta com
  // id inválido só devolveria erro.
  if (!tripId || String(tripId).startsWith('local-')) {
    return { success: true, data: [] };
  }

  const { data, error } = await supabase
    .from('trip_members')
    .select(MEMBER_SELECT)
    .eq('trip_id', tripId);

  if (error) return { success: false, data: [], error: error.message };

  const members = (data || []).map((row) => ({
    id: row.user_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
    profile: row.profiles || null,
  }));

  // Dono primeiro, depois quem entrou antes. Sem ordenação explícita a lista
  // muda de ordem entre carregamentos, e a mesma tela reabre diferente.
  return {
    success: true,
    data: members.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
      return String(a.joinedAt || '').localeCompare(String(b.joinedAt || ''));
    }),
  };
};
