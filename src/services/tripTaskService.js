// As tarefas do grupo de uma viagem.
//
// REGRA DA CASA, igual ao `tripMemberService`: nada aqui lança. A falha volta
// como `success: false` mais a mensagem, e a tela decide. Uma viagem cujas
// tarefas não carregaram continua sendo uma viagem que abre.
//
// AQUI A ESCRITA É DIRETA NA TABELA, e não por RPC como em `trip_members`. A
// diferença é que lá havia escalada de privilégio possível (um membro
// atualizando a própria linha trocaria o próprio `role` para 'owner'), e aqui
// não há: a RLS diz QUAIS linhas, o trigger `guard_trip_task_columns` diz QUAIS
// colunas, e as três colunas de autoria (`created_by`, `completed_by`,
// `completed_at`) são escritas só pelo banco, com `auth.uid()`. Não sobra nada
// para o cliente mentir.
//
// POR QUE A CONSULTA NÃO TRAZ O PERFIL DE NINGUÉM
//
// `trip_tasks` tem TRÊS chaves estrangeiras para `profiles` — `assigned_to`,
// `created_by` e `completed_by`. Um `select=...,profiles(...)` seria recusado
// inteiro com PGRST201, o mesmo erro que já derrubou a lista de viagens
// (trip_activities → trip_days) e a lista de participantes (trip_members →
// profiles). Dava para desambiguar pelo nome da constraint, mas nem isso é
// preciso: a tela que mostra as tarefas JÁ tem a lista de participantes
// carregada, e todo responsável é um participante. Os ids bastam, e `utils/
// tripTasks` resolve nome e avatar contra aquela lista.
import { supabase } from './supabase';

const TASK_SELECT = 'id, trip_id, title, assigned_to, created_by, is_done, completed_by, completed_at, created_at';

/**
 * A mensagem que a tela vai mostrar.
 *
 * O `raise exception` do `guard_trip_task_columns` é escrito para ser lido ("Só
 * um organizador pode alterar..."), então repassá-lo é melhor do que trocar por
 * um genérico. Erro de rede e de permissão do PostgREST vêm em inglês e com
 * jargão — nesses a frase da casa serve melhor.
 */
const errorMessage = (error, fallback) => {
  const texto = typeof error?.message === 'string' ? error.message.trim() : '';
  if (!texto || /^(failed to fetch|network|jwt|permission denied|new row violates)/i.test(texto)) {
    return fallback;
  }
  return texto;
};

/**
 * As tarefas de uma viagem.
 *
 * @param {string | null} tripId
 * @returns {Promise<{ success: boolean, data: Array<any>, error?: string }>}
 */
export const getTripTasks = async (tripId) => {
  // Roteiro recém-gerado ainda não foi salvo, e roteiro `local-` nunca existiu
  // no banco: nos dois casos não há tarefa para buscar, e uma consulta com id
  // inválido só devolveria erro.
  if (!tripId || String(tripId).startsWith('local-')) {
    return { success: true, data: [] };
  }

  const { data, error } = await supabase
    .from('trip_tasks')
    .select(TASK_SELECT)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });

  if (error) {
    return { success: false, data: [], error: errorMessage(error, 'Não foi possível carregar as tarefas.') };
  }
  return { success: true, data: data || [] };
};

/**
 * Cria uma tarefa. Só organizador — quem recusa é a RLS.
 *
 * `created_by` NÃO vai no insert de propósito: quem escreve é o trigger, com
 * `auth.uid()`. Mandá-lo daqui seria dar ao cliente uma opinião sobre autoria
 * que o banco descarta de qualquer jeito — e um dia alguém acreditaria nela.
 *
 * O aviso para os outros participantes também não sai daqui: ele é trigger do
 * INSERT. É o que amarra a notificação à tarefa EXISTIR, e não a esta função ter
 * sido chamada — uma falha de RLS depois de um aviso enviado seria o pior dos
 * dois mundos.
 *
 * @param {{ tripId: string, title: string, assignedTo?: string | null }} params
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export const createTripTask = async ({ tripId, title, assignedTo = null }) => {
  if (!tripId || String(tripId).startsWith('local-')) {
    return { success: false, error: 'Salve a viagem antes de criar tarefas.' };
  }

  const { data, error } = await supabase
    .from('trip_tasks')
    .insert({ trip_id: tripId, title, assigned_to: assignedTo || null })
    .select(TASK_SELECT)
    .single();

  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível criar a tarefa agora.') };
  }
  return { success: true, data };
};

/**
 * Marca ou desmarca uma tarefa.
 *
 * Manda SÓ `is_done`. `completed_by` e `completed_at` são do trigger, e mandá-los
 * daqui esbarraria no `guard_trip_task_columns` para quem não é organizador —
 * por um campo que a pessoa nem escolheu.
 *
 * O aviso de conclusão sai da transição false -> true no banco, e não deste
 * botão: desmarcar não avisa ninguém, e salvar de novo uma tarefa já concluída
 * também não.
 *
 * @param {{ taskId: string, done: boolean }} params
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
export const setTripTaskDone = async ({ taskId, done }) => {
  if (!taskId) return { success: false, error: 'Tarefa não encontrada.' };

  const { data, error } = await supabase
    .from('trip_tasks')
    .update({ is_done: Boolean(done) })
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single();

  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível atualizar a tarefa agora.') };
  }
  return { success: true, data };
};

/**
 * Apaga uma tarefa. Só organizador — quem recusa é a RLS.
 *
 * @param {string} taskId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const deleteTripTask = async (taskId) => {
  if (!taskId) return { success: false, error: 'Tarefa não encontrada.' };

  const { error } = await supabase.from('trip_tasks').delete().eq('id', taskId);

  if (error) {
    return { success: false, error: errorMessage(error, 'Não foi possível excluir a tarefa agora.') };
  }
  return { success: true };
};
