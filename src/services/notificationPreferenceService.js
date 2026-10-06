// Ler e gravar as preferências de notificação.
//
// AUSÊNCIA DE LINHA É "TUDO LIGADO"
//
// A tabela só ganha linha quando a pessoa mexe em algo, então a leitura precisa
// tratar "não encontrei" como estado válido, e não como erro. É o que
// `DEFAULT_NOTIFICATION_PREFERENCES` responde. O trigger do banco faz a MESMA
// leitura do mesmo jeito (ver a migração 20260930120000): sem linha, o aviso
// passa.
//
// POR QUE UPSERT, E NÃO UPDATE
//
// O primeiro toque de cada conta acontece sem linha nenhuma: um `update` afetaria
// zero linhas, devolveria sucesso, e o interruptor voltaria sozinho ao antigo
// estado no recarregamento seguinte — o tipo de bug que só aparece em conta nova,
// nunca na do desenvolvedor.
import { supabase } from './supabase';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
} from '../utils/notificationCategories';

/** As colunas que a tela pode gravar. `updated_at` é do trigger, `user_id` é da sessão. */
const WRITABLE_COLUMNS = Object.freeze(['all_enabled', ...NOTIFICATION_CATEGORIES]);

/**
 * As preferências de quem está logado, já completas.
 *
 * @returns {Promise<{ success: boolean, data: Record<string, boolean>, error?: string }>}
 */
export const getNotificationPreferences = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, data: { ...DEFAULT_NOTIFICATION_PREFERENCES }, error: 'Sem sessão' };
  }

  // `maybeSingle` e não `single`: sem linha é o caso comum, e `single` trataria
  // isso como erro PGRST116.
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(['all_enabled', ...NOTIFICATION_CATEGORIES].join(','))
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[notificações] leitura de preferências falhou:', error.message);
    return { success: false, data: { ...DEFAULT_NOTIFICATION_PREFERENCES }, error: error.message };
  }

  // O cast é necessário porque o PostgREST tipa o retorno de um select montado em
  // runtime de forma frouxa; o shape de verdade é a lista de colunas logo acima.
  const linha = /** @type {Record<string, boolean>} */ (data || {});

  // O spread sobre o padrão cobre a coluna que a migração acrescentar depois de
  // uma linha já existir: ela vem como `undefined` do select e precisa valer
  // `true`, não "desligada".
  return { success: true, data: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...linha } };
};

/**
 * Grava uma mudança, preservando o resto.
 *
 * O `patch` traz só o que mudou, mas o upsert manda o ESTADO INTEIRO: um upsert
 * parcial faz INSERT quando a linha não existe, e aí as colunas que ficaram de
 * fora nasceriam com o default — o que por sorte é `true` hoje, e deixaria de ser
 * correto no dia em que alguém mudar um default. Mandar tudo não depende disso.
 *
 * @param {Record<string, boolean>} current o estado completo de agora
 * @param {Record<string, boolean>} patch o que mudou
 * @returns {Promise<{ success: boolean, data?: Record<string, boolean>, error?: string }>}
 */
export const saveNotificationPreferences = async (current, patch) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Sem sessão' };

  const proximo = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...current, ...patch };
  const linha = { user_id: user.id };
  for (const coluna of WRITABLE_COLUMNS) linha[coluna] = proximo[coluna] !== false;

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(linha, { onConflict: 'user_id' });

  if (error) {
    console.error('[notificações] gravação de preferências falhou:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, data: proximo };
};
