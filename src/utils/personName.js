// Como uma pessoa é chamada na tela, quando o espaço é curto.
//
// Módulo PURO — existe para a regra ficar num lugar só. Ela já vivia dentro de
// `activityAttribution` (a tag "editado por X"), e as tarefas do grupo precisam
// exatamente da mesma coisa em "concluído por X". Duas cópias da mesma regra
// discordam um dia: uma passa a cair no username quando o nome é vazio, a outra
// não, e o mesmo participante aparece com dois nomes em duas linhas da mesma
// tela.

/**
 * O primeiro nome, ou o username quando não há nome de exibição.
 *
 * PRIMEIRO NOME e não o nome inteiro porque quem chama divide a linha com outra
 * coisa — o resto do cartão da parada, o título da tarefa. "concluído por
 * Verônica Albuquerque Mendes" empurra tudo.
 *
 * @param {{ display_name?: string | null, username?: string | null } | null | undefined} profile
 * @returns {string} vazio quando não há nome nenhum a mostrar
 */
export const shortPersonName = (profile) => {
  const primeiro = String(profile?.display_name ?? '').trim().split(/\s+/)[0];
  return primeiro || String(profile?.username ?? '').trim();
};

/**
 * O nome de exibição inteiro, com o username de reserva.
 *
 * Para onde cabe: a linha do responsável pela tarefa, que tem a largura do
 * cartão só para ela.
 *
 * @param {{ display_name?: string | null, username?: string | null } | null | undefined} profile
 * @returns {string} vazio quando não há nome nenhum a mostrar
 */
export const fullPersonName = (profile) => {
  const nome = String(profile?.display_name ?? '').trim();
  return nome || String(profile?.username ?? '').trim();
};
