// Bloqueio e denúncia: as duas ferramentas que a loja exige para conteúdo de
// usuário (Apple 1.2 / Google Play UGC).
//
// AS DUAS RESOLVEM COISAS DIFERENTES, E A TELA PRECISA DEIXAR ISSO CLARO
//
// Bloquear é privado e imediato: a pessoa some da minha frente, nos dois
// sentidos, e o efeito é meu. Denunciar é um pedido de revisão humana, que não
// muda nada na tela de quem denuncia. Quem quer as duas coisas faz as duas.
//
// TODO O FILTRO É DO BANCO
//
// Nenhuma função aqui filtra bloqueado de lista nenhuma — quem faz isso são as
// policies (ver 20260914170000_block_users.sql). É de propósito: filtrar no
// cliente significa que o conteúdo CHEGOU ao aparelho e só não foi desenhado, e
// bastaria um caminho de leitura esquecido, entre nove, para vazar.
import { supabase } from './supabase';

/** Motivos oferecidos na folha de denúncia, na ordem em que aparecem. */
export const REPORT_REASONS = [
  'Conteúdo impróprio',
  'Spam',
  'Assédio ou bullying',
  'Informação falsa',
  'Outro',
];

/** O motivo que abre o campo de texto livre. */
export const REPORT_REASON_OTHER = 'Outro';

/** Os quatro alvos que o banco aceita (CHECK em `reports.target_type`). */
export const REPORT_TARGETS = ['photo', 'comment', 'profile', 'message'];

// ─────────────────────────────────────────────────────────────────────────────
// Bloqueio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bloqueia alguém. Mútuo: os dois deixam de se ver.
 *
 * A RPC também desfaz o "seguir" nos dois sentidos — isso é regra de banco, não
 * de tela, e a tela não deve tentar repetir.
 *
 * @param {string} targetId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const blockUser = async (targetId) => {
  if (!targetId) return { success: false, error: 'Usuário inválido.' };

  const { error } = await supabase.rpc('block_user', { target_id: targetId });
  if (error) {
    console.error('[moderação] block_user falhou:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
};

/**
 * Desfaz o PRÓPRIO bloqueio. Se a outra pessoa também bloqueou, o dela continua.
 *
 * @param {string} targetId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const unblockUser = async (targetId) => {
  if (!targetId) return { success: false, error: 'Usuário inválido.' };

  const { error } = await supabase.rpc('unblock_user', { target_id: targetId });
  if (error) {
    console.error('[moderação] unblock_user falhou:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
};

/**
 * Eu bloqueei esta pessoa?
 *
 * Responde só pelo MEU lado, que é tudo o que a policy de `blocked_users` deixa
 * ler — e é o que a tela precisa saber para decidir entre "Bloquear" e
 * "Desbloquear". Se foi a outra pessoa quem me bloqueou, o perfil dela nem
 * chega até aqui: some pela policy de `profiles`.
 *
 * @param {string} targetId
 * @returns {Promise<boolean>}
 */
export const isBlockedByMe = async (targetId) => {
  if (!targetId) return false;

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) return false;

  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetId)
    .maybeSingle();

  if (error) {
    console.error('[moderação] leitura de bloqueio falhou:', error.message);
    return false;
  }
  return !!data;
};

/**
 * A lista de quem eu bloqueei, com nome e foto, para a tela de desbloqueio.
 *
 * Vai por RPC e não por `select` com join porque a policy de `profiles` esconde
 * exatamente quem está bloqueado: o join voltaria `null` em toda linha e a tela
 * mostraria uma coluna de uuid. `get_blocked_profiles` é `security definer` e
 * devolve só os perfis que o próprio solicitante bloqueou — ver
 * 20260914183000_blocked_profiles.sql.
 *
 * @returns {Promise<{ success: boolean, data: Array<{ blocked_id: string, username: string|null, display_name: string|null, avatar_url: string|null, created_at: string }>, error?: string }>}
 */
export const getBlockedUsers = async () => {
  const { data, error } = await supabase.rpc('get_blocked_profiles');

  if (error) {
    console.error('[moderação] lista de bloqueados falhou:', error.message);
    return { success: false, data: [], error: error.message };
  }
  return { success: true, data: data || [] };
};

// ─────────────────────────────────────────────────────────────────────────────
// Denúncia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria uma denúncia.
 *
 * Não é idempotente de propósito: denunciar o mesmo conteúdo duas vezes é sinal
 * para quem modera, não duplicidade a evitar.
 *
 * @param {{ targetType: 'photo'|'comment'|'profile'|'message', targetId: string, reason: string, details?: string }} params
 * @returns {Promise<{ success: boolean, reportId?: string, error?: string }>}
 */
export const createReport = async ({ targetType, targetId, reason, details }) => {
  if (!REPORT_TARGETS.includes(targetType)) {
    return { success: false, error: 'Tipo de conteúdo inválido.' };
  }
  if (!targetId) return { success: false, error: 'Conteúdo inválido.' };
  if (!reason?.trim()) return { success: false, error: 'Escolha um motivo.' };

  const { data, error } = await supabase.rpc('create_report', {
    target_type: targetType,
    target_id: targetId,
    reason: reason.trim(),
    details: details?.trim() || null,
  });

  if (error) {
    console.error('[moderação] create_report falhou:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true, reportId: data };
};
