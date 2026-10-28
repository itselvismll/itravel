// As tarefas do grupo: quem pode o quê, e o que cada linha da lista diz.
//
// Módulo PURO — sem React, sem Supabase. Mesmo arranjo do resto da colaboração:
// a regra aqui, a pintura em `components/trip/TripTasksPanel`. É o que deixa o
// `node:test` afirmar a permissão sem browser.
//
// ISTO NÃO É SEGURANÇA — é a honestidade da interface, pelo mesmo motivo que
// `utils/tripPermissions` explica: quem recusa a escrita de verdade é a RLS de
// `trip_tasks` (migração 20260923140000). Se este arquivo mentir, o banco
// continua protegido, e o que acontece é pior de outro jeito: um checkbox que
// aceita o toque e devolve erro.
//
// POR QUE A PERMISSÃO DE TAREFA NÃO ENTROU NA MATRIZ DE `tripPermissions`
//
// Aquela matriz responde por PAPEL ("editor pode editar o roteiro?"). Marcar uma
// tarefa não depende só do papel: depende de a tarefa ser SUA. É uma pergunta
// sobre o par (pessoa, tarefa), e enfiá-la numa tabela de papéis exigiria uma
// coluna que só uma linha usa. Quem é organizador continua saindo de lá.
import { fullPersonName, shortPersonName } from './personName';

/**
 * Quem pode criar tarefa: só organizador.
 *
 * @param {{ role?: string | null, status?: string | null }} abilities o que
 *   `tripPermissions.tripAbilities` devolveu para quem está olhando
 * @returns {boolean}
 */
export const canCreateTask = (abilities) =>
  abilities?.role === 'owner' && abilities?.status === 'accepted';

/**
 * Esta pessoa pode marcar ou desmarcar ESTA tarefa?
 *
 * O responsável ou um organizador — a mesma dupla que a policy de UPDATE
 * aceita. Tarefa sem responsável (`assigned_to` nulo) fica só com o
 * organizador: ninguém é "o responsável" por ela.
 *
 * @param {{ assigned_to?: string | null }} task
 * @param {{ role?: string | null, status?: string | null }} abilities
 * @param {string | null} userId
 * @returns {boolean}
 */
export const canToggleTask = (task, abilities, userId) => {
  if (canCreateTask(abilities)) return true;
  if (!userId || abilities?.status !== 'accepted') return false;
  return task?.assigned_to === userId;
};

/**
 * O participante de um id, para a linha achar avatar e nome.
 *
 * Volta `null` para quem saiu da viagem: sem perfil não há nome nem avatar, e a
 * tela prefere não dizer nada a dizer "atribuído a alguém".
 *
 * @param {Array<{ id: string, role?: string | null, profile?: any }>} members
 * @param {string | null | undefined} userId
 */
const findMember = (members, userId) => {
  if (!userId) return null;
  return (Array.isArray(members) ? members : []).find((m) => m?.id === userId) || null;
};

/**
 * A pessoa no formato que o `MemberAvatar` espera.
 *
 * @param {{ id: string, role?: string | null, profile?: any } | null} member
 */
const toPerson = (member) => (member ? {
  id: member.id,
  role: member.role ?? null,
  username: member.profile?.username ?? null,
  display_name: member.profile?.display_name ?? null,
  avatar_url: member.profile?.avatar_url ?? null,
} : null);

/**
 * Tudo que uma linha da lista precisa mostrar, decidido de uma vez.
 *
 * A tela pergunta uma vez por tarefa em vez de chamar quatro funções no meio do
 * JSX — mesmo motivo do `tripAbilities`.
 *
 * `você` no lugar do próprio nome nos dois rótulos: "atribuído a você" é o que
 * faz a pessoa achar a própria tarefa correndo os olhos pela lista, que é a
 * única coisa que ela veio fazer aqui.
 *
 * @param {{ id: string, title: string, assigned_to?: string | null, is_done?: boolean,
 *          completed_by?: string | null, completed_at?: string | null }} task
 * @param {Array<{ id: string, role?: string | null, profile?: any }>} members
 * @param {{ role?: string | null, status?: string | null }} abilities
 * @param {string | null} userId
 * @returns {{
 *   id: string, title: string, done: boolean, canToggle: boolean,
 *   assignee: { person: any, label: string } | null,
 *   completedLabel: string | null,
 * }}
 */
export const taskRow = (task, members, abilities, userId = null) => {
  const responsavel = findMember(members, task?.assigned_to);
  const concluiu = findMember(members, task?.completed_by);

  const nomeResponsavel = task?.assigned_to === userId
    ? 'você'
    : fullPersonName(responsavel?.profile);

  const nomeConcluiu = task?.completed_by === userId
    ? 'você'
    : shortPersonName(concluiu?.profile);

  return {
    id: task?.id,
    title: String(task?.title ?? ''),
    done: Boolean(task?.is_done),
    canToggle: canToggleTask(task, abilities, userId),
    // Sem responsável na viagem (nulo, ou pessoa que saiu) a linha não inventa
    // um: ela fica só com o título, e o organizador vê que falta atribuir.
    assignee: responsavel && nomeResponsavel
      ? { person: toPerson(responsavel), label: nomeResponsavel }
      : null,
    // Só em tarefa concluída, e só quando se sabe QUEM concluiu. "Concluído por
    // alguém" não informa nada, e a tarefa riscada já diz que está feita.
    completedLabel: task?.is_done && nomeConcluiu ? `Concluído por ${nomeConcluiu}` : null,
  };
};

/**
 * A lista na ordem em que a tela mostra: por fazer primeiro, concluídas no fim.
 *
 * A tarefa concluída não some — ela é o registro de que aquilo foi feito, e
 * sumiria justamente na hora em que alguém quer conferir. Mas ela também não pode
 * ficar no meio do caminho de quem abriu a tela para ver o que falta. Dentro de
 * cada grupo, a ordem de criação, que é a mesma em todo carregamento.
 *
 * @param {Array<any>} tasks
 * @returns {Array<any>}
 */
export const sortTasks = (tasks) =>
  [...(Array.isArray(tasks) ? tasks : [])].sort((a, b) => {
    if (Boolean(a?.is_done) !== Boolean(b?.is_done)) return a?.is_done ? 1 : -1;
    return String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? ''));
  });

/**
 * Quantas já foram feitas, para o contador do bloco.
 *
 * @param {Array<{ is_done?: boolean }>} tasks
 * @returns {{ done: number, total: number }}
 */
export const taskProgress = (tasks) => {
  const lista = Array.isArray(tasks) ? tasks : [];
  return { done: lista.filter((t) => t?.is_done).length, total: lista.length };
};

/** O mesmo limite do `check` da coluna `title` (migração 20260923140000). */
export const TASK_TITLE_MAX_LENGTH = 120;

/**
 * O título é aceitável?
 *
 * Espaço em branco não é tarefa. O limite é o do banco, repetido aqui para a
 * recusa acontecer antes da ida ao servidor — lá ela voltaria como violação de
 * `check`, em inglês.
 *
 * @param {string} title
 * @returns {{ valid: boolean, value: string, error?: string }}
 */
export const validateTaskTitle = (title) => {
  const limpo = String(title ?? '').trim();
  if (!limpo) return { valid: false, value: '', error: 'Escreva o que precisa ser feito.' };
  if (limpo.length > TASK_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      value: limpo,
      error: `A tarefa deve ter no máximo ${TASK_TITLE_MAX_LENGTH} caracteres.`,
    };
  }
  return { valid: true, value: limpo };
};
