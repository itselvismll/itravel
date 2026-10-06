// Quem pode o quê numa viagem compartilhada.
//
// Módulo puro — sem React, sem Supabase. Existe para a regra ficar num lugar só.
//
// POR QUE ISTO NÃO É SEGURANÇA, E POR QUE AINDA ASSIM PRECISA EXISTIR
//
// A segurança está na RLS do Postgres: `can_edit_trip` recusa a escrita de um
// viewer mesmo que o app mande. Se este arquivo mentir, o banco continua
// protegido — o que acontece é pior de outro jeito: a tela oferece um botão que
// falha, e o usuário leva um erro no lugar de nunca ter visto o botão.
//
// Então o papel daqui é a HONESTIDADE DA INTERFACE, não o bloqueio. E por isso a
// regra é uma tabela, e não um `if` espalhado por tela: espalhada, ela divergiu
// em algum lugar, e a divergência aparece como botão morto.
//
// Os papéis e a decisão de produto de cada um:
//
//   owner  — acesso total: edita, convida, remove, promove outro a dono.
//   editor — edita roteiro, checklist e orçamento. Não mexe em gente.
//   viewer — só lê.
//
// E uma regra que vale para OS TRÊS: aplicar a viagem no próprio globo. Não é
// permissão de viagem, é preferência de quem olha — a Fase 0 moveu esse estado
// para a linha do participante justamente por isso.

/** Papéis conhecidos, em ordem de poder. */
export const TRIP_ROLES = Object.freeze(['viewer', 'editor', 'owner']);

/** Como cada papel é chamado na tela. */
// O texto saiu daqui para `pt.json` (tripTravelers.roles.*) na fase 1 do
// i18n. Este módulo é puro (sem react-native, sem contexto de idioma), então
// ele guarda a CHAVE, e quem renderiza resolve com `t()` — mesma regra de
// `notificationCategories.labelKey` e `TRAVEL_PACES.labelKey`.
export const ROLE_LABEL_KEY = Object.freeze({
  owner: 'tripTravelers.roles.owner',
  editor: 'tripTravelers.roles.editor',
  viewer: 'tripTravelers.roles.viewer',
});

/**
 * A matriz. Linha = ação, coluna = papel que pode.
 *
 * Ação nova entra aqui, e a tela pergunta — em vez de a tela decidir sozinha e
 * esta tabela ficar desatualizada sem ninguém notar.
 */
const ALLOWED = Object.freeze({
  // Roteiro, checklist, orçamento: editor e dono.
  editItinerary: ['owner', 'editor'],
  editChecklist: ['owner', 'editor'],
  editBudget: ['owner', 'editor'],

  // Gente: só dono.
  invite: ['owner'],
  removeMember: ['owner'],
  changeRole: ['owner'],

  // A viagem inteira: só dono. Excluir apaga para todos.
  deleteTrip: ['owner'],

  // Ler é de qualquer participante, inclusive de quem ainda não aceitou — é o
  // que permite decidir se aceita.
  view: ['owner', 'editor', 'viewer'],

  // O globo pessoal: de todos, sempre. Ver o cabeçalho.
  toggleOnMap: ['owner', 'editor', 'viewer'],
});

/**
 * Ações que o convite PENDENTE também pode.
 *
 * Ler, para poder decidir se aceita. E aplicar no próprio globo, porque isso
 * nunca foi permissão de viagem: é preferência de quem olha, e a Fase 0 moveu o
 * estado para a linha do participante exatamente por isso.
 */
const ALLOWED_WHILE_PENDING = Object.freeze(['view', 'toggleOnMap']);

/** @typedef {keyof typeof ALLOWED} TripAction */

/**
 * O papel pode a ação?
 *
 * Papel desconhecido (nulo, texto estranho, papel que o banco ganhou e o app
 * ainda não conhece) responde NÃO para tudo menos ler. É o lado seguro do erro:
 * esconder um botão que deveria aparecer é um incômodo; mostrar um que não
 * deveria é um erro na cara do usuário.
 *
 * @param {string | null | undefined} role
 * @param {TripAction} action
 * @param {{ status?: string | null }} [options] `status` do participante
 * @returns {boolean}
 */
export const can = (role, action, { status } = {}) => {
  const permitidos = ALLOWED[action];
  if (!permitidos) return false;

  // Convite pendente enxerga a viagem e aplica no próprio globo; nada mais. Sem
  // isto, um convidado que ainda não respondeu veria os botões de edição — e a
  // RLS os recusaria, porque `can_edit_trip` exige status 'accepted'.
  if (status === 'pending' && !ALLOWED_WHILE_PENDING.includes(action)) return false;

  return permitidos.includes(String(role));
};

/**
 * Quantos donos ACEITOS a viagem tem.
 *
 * @param {Array<{ role?: string, status?: string }>} members
 * @returns {number}
 */
export const countOwners = (members) =>
  (members ?? []).filter((m) => m?.role === 'owner' && m?.status === 'accepted').length;

/**
 * Esta pessoa pode sair da viagem?
 *
 * A REGRA QUE ISTO EXISTE PARA EXPLICAR: o único dono não sai. Não é capricho —
 * uma viagem sem dono fica viva e ninguém pode editar nem excluir: invisível para
 * o app e impossível de limpar. O banco já recusa (o trigger
 * prevent_last_trip_owner_removal, da Fase 0), então sem esta função o usuário
 * descobriria a regra levando um erro.
 *
 * Devolve o MOTIVO junto, porque "não pode" sem explicação vira suporte.
 *
 * @param {Array<{ id?: string, role?: string, status?: string }>} members
 * @param {string | null} userId
 * @returns {{ allowed: boolean, reason?: string }}
 */
export const canLeaveTrip = (members, userId) => {
  const lista = members ?? [];
  const eu = lista.find((m) => m?.id === userId);

  if (!eu) return { allowed: false, reason: 'Você não participa desta viagem.' };

  if (eu.role !== 'owner' || eu.status !== 'accepted') return { allowed: true };

  if (countOwners(lista) > 1) return { allowed: true };

  return {
    allowed: false,
    reason: 'Você é o único organizador. Promova outro participante a organizador antes de sair.',
  };
};

/**
 * O papel de uma pessoa na lista de participantes.
 *
 * @param {Array<{ id?: string, role?: string, status?: string }>} members
 * @param {string | null} userId
 * @returns {{ role: string | null, status: string | null }}
 */
export const memberRole = (members, userId) => {
  const eu = (members ?? []).find((m) => m?.id === userId);
  return { role: eu?.role ?? null, status: eu?.status ?? null };
};

/**
 * Atalho para a tela: tudo que ela precisa saber de uma vez.
 *
 * A tela pergunta uma vez e usa o resultado em vários botões, em vez de chamar
 * `can` seis vezes no meio do JSX.
 *
 * @param {Array<any>} members
 * @param {string | null} userId
 */
export const tripAbilities = (members, userId) => {
  const { role, status } = memberRole(members, userId);
  const opcoes = { status };

  return {
    role,
    status,
    canEdit: can(role, 'editItinerary', opcoes),
    canEditChecklist: can(role, 'editChecklist', opcoes),
    canEditBudget: can(role, 'editBudget', opcoes),
    canInvite: can(role, 'invite', opcoes),
    canManageMembers: can(role, 'removeMember', opcoes),
    canChangeRole: can(role, 'changeRole', opcoes),
    canDeleteTrip: can(role, 'deleteTrip', opcoes),
    // Vale para qualquer participante, aceito ou pendente: é preferência de
    // quem olha, não permissão sobre a viagem.
    canToggleOnMap: can(role, 'toggleOnMap', opcoes),
    leave: canLeaveTrip(members, userId),
  };
};
