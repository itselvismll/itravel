// Quem participa de uma viagem, e como entra ou sai dela.
//
// A tabela `trip_members` existe desde a Fase 0; a Fase 2 acrescentou as portas
// de entrada (convite direto e link) e a administração de quem já está dentro.
//
// REGRA DA CASA: nada aqui lança. A falha volta como `success: false` mais a
// mensagem, e a tela decide o que fazer. Uma viagem sem a lista de viajantes
// continua sendo uma viagem que abre.
//
// TODA ESCRITA PASSA POR RPC, e não por insert/update direto na tabela. Não é
// preferência de estilo: a policy de UPDATE de `trip_members` é só do dono, e se
// um membro pudesse atualizar a própria linha ele trocaria o próprio `role` para
// 'owner' — a escalada de privilégio mais óbvia que existe num modelo assim. As
// funções escrevem o campo permitido e nada mais.
//
// AS MENSAGENS DE ERRO DO BANCO CHEGAM AO USUÁRIO. As RPCs da Fase 2 levantam
// exceção com texto escrito para ser lido ("Você é o único organizador...",
// "Este convite não é mais válido."), então repassá-las é melhor do que trocar por
// um "algo deu errado" genérico. O que este módulo faz é garantir que exista
// SEMPRE uma mensagem, mesmo quando o erro vem sem texto.
import { supabase } from './supabase';

/**
 * A mensagem que a tela vai mostrar.
 *
 * O Postgres devolve o texto do `raise exception` em `error.message`. Quando não
 * houver um, a frase de reserva precisa dizer o que fazer — "erro" sozinho não
 * ajuda ninguém.
 */
const errorMessage = (error, fallback) => {
  const texto = typeof error?.message === 'string' ? error.message.trim() : '';
  // Erro de rede e erro de permissão do PostgREST vêm em inglês e com jargão;
  // nesses casos a frase da casa é melhor do que o texto cru.
  if (!texto || /^(failed to fetch|network|jwt|permission denied)/i.test(texto)) {
    return fallback;
  }
  return texto;
};

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

// ── Convidar ────────────────────────────────────────────────────────────────

/**
 * Convida um usuário do Journi para a viagem.
 *
 * O convite nasce `pending`: a pessoa passa a VER a viagem (é o que permite
 * decidir se aceita) e não escreve nada até aceitar. O aviso sai por trigger no
 * banco, não daqui — assim ele acontece igual pelas duas portas de entrada.
 *
 * @param {{ tripId: string, userId: string, role?: 'editor' | 'viewer' }} params
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const inviteTripMember = async ({ tripId, userId, role = 'editor' }) => {
  if (!tripId || !userId) {
    return { success: false, error: 'Escolha quem você quer convidar.' };
  }

  const { error } = await supabase.rpc('invite_trip_member', {
    p_trip_id: tripId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível enviar o convite agora.') };
  }
  return { success: true };
};

/**
 * Gera (ou regenera) o link de convite da viagem.
 *
 * Gerar um novo REVOGA o anterior — é o que faz "revogar" significar alguma
 * coisa. A tela precisa deixar isso claro antes de o dono tocar no botão de novo.
 *
 * @param {{ tripId: string, role?: 'editor' | 'viewer' }} params
 * @returns {Promise<{ success: boolean, data?: string, error?: string }>} o token
 */
export const createTripInviteLink = async ({ tripId, role = 'editor' }) => {
  if (!tripId || String(tripId).startsWith('local-')) {
    return { success: false, error: 'Salve a viagem antes de convidar alguém.' };
  }

  const { data, error } = await supabase.rpc('create_trip_invite_link', {
    p_trip_id: tripId,
    p_role: role,
  });

  if (error || !data) {
    return { success: false, error: errorMessage(error, 'Não foi possível gerar o link agora.') };
  }
  return { success: true, data };
};

/**
 * O link ativo da viagem, se houver.
 *
 * Serve para a tela mostrar o link que já existe em vez de gerar outro a cada
 * abertura — cada geração revoga o anterior, e quem já recebeu o link ficaria
 * para trás.
 *
 * @param {string} tripId
 * @returns {Promise<{ success: boolean, data: { token: string, role: string, expiresAt: string | null } | null }>}
 */
export const getActiveTripInvite = async (tripId) => {
  if (!tripId || String(tripId).startsWith('local-')) return { success: true, data: null };

  const { data, error } = await supabase
    .from('trip_invites')
    .select('token, role, expires_at')
    .eq('trip_id', tripId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { success: false, data: null };

  // Expirado é o mesmo que inexistente para a tela: ela oferece gerar um novo.
  if (data?.expires_at && new Date(data.expires_at) < new Date()) {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: data ? { token: data.token, role: data.role, expiresAt: data.expires_at } : null,
  };
};

/**
 * Revoga todos os links da viagem.
 *
 * @param {string} tripId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const revokeTripInvites = async (tripId) => {
  const { error } = await supabase.rpc('revoke_trip_invites', { p_trip_id: tripId });
  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível revogar o link agora.') };
  }
  return { success: true };
};

/**
 * Entra na viagem usando o token de um link.
 *
 * Devolve o `tripId` para a tela poder navegar direto para a viagem — é o que
 * torna o link útil: abrir e estar dentro.
 *
 * @param {string} token
 * @returns {Promise<{ success: boolean, data?: string, error?: string }>}
 */
export const redeemTripInvite = async (token) => {
  if (!token) return { success: false, error: 'Este convite não é mais válido.' };

  const { data, error } = await supabase.rpc('redeem_trip_invite', { p_token: token });

  if (error || !data) {
    return {
      success: false,
      error: errorMessage(error, 'Este convite não é mais válido.'),
    };
  }
  return { success: true, data };
};

// ── Administrar ─────────────────────────────────────────────────────────────

/**
 * Aceita um convite pendente.
 *
 * @param {string} tripId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const acceptTripInvite = async (tripId) => {
  const { error } = await supabase.rpc('accept_trip_invite', { p_trip_id: tripId });
  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível aceitar o convite agora.') };
  }
  return { success: true };
};

/**
 * Muda o papel de um participante. É por aqui que se promove alguém a
 * organizador — e pode haver mais de um.
 *
 * @param {{ tripId: string, userId: string, role: 'owner' | 'editor' | 'viewer' }} params
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const setTripMemberRole = async ({ tripId, userId, role }) => {
  const { error } = await supabase.rpc('set_trip_member_role', {
    p_trip_id: tripId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível mudar o papel agora.') };
  }
  return { success: true };
};

/**
 * Remove um participante da viagem.
 *
 * @param {{ tripId: string, userId: string }} params
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const removeTripMember = async ({ tripId, userId }) => {
  const { error } = await supabase.rpc('remove_trip_member', {
    p_trip_id: tripId,
    p_user_id: userId,
  });

  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível remover o participante agora.') };
  }
  return { success: true };
};

/**
 * Sai da viagem.
 *
 * O banco recusa a saída do último organizador, com mensagem própria — e é essa
 * mensagem que chega ao usuário. A tela também checa antes (`canLeaveTrip`, em
 * utils/tripPermissions) para não oferecer uma ação que vai falhar; esta é a
 * segunda barreira, a que vale de verdade.
 *
 * @param {string} tripId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const leaveTrip = async (tripId) => {
  const { error } = await supabase.rpc('leave_trip', { p_trip_id: tripId });
  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível sair da viagem agora.') };
  }
  return { success: true };
};
