// O limite do campo Nome do perfil, e o que o campo aceita enquanto se digita.
//
// Módulo PURO, para o `node:test` afirmar a regra sem tela.
//
// O BUG QUE ISTO FECHA
//
// O campo recusava todo texto com mais de 12 caracteres — inclusive o texto
// MENOR que o atual. Um nome que já chegava acima do limite (vindo do cadastro
// ou do Google, que não passam por esta tela) travava o campo: apagar uma letra
// de "Journi suporte" (14) dava 13, que também passa de 12, e a tecla era
// ignorada. A pessoa não conseguia nem consertar o próprio nome, e o aviso
// "Limite máximo atingido" parecia dizer que o problema era ela.

export const DISPLAY_NAME_MAX_LENGTH = 12;

/**
 * Se o campo aceita o novo valor digitado.
 *
 * Diminuir é sempre permitido, esteja o nome acima do limite ou não: é
 * justamente o caminho de volta para dentro dele. O limite só barra o que
 * CRESCE para além de 12.
 *
 * @param {string} previous o valor atual do campo
 * @param {string} next o valor que a tecla (ou a colagem) produziu
 * @returns {boolean}
 */
export const acceptDisplayNameInput = (previous, next) => {
  const novo = String(next ?? '');
  return novo.length <= DISPLAY_NAME_MAX_LENGTH || novo.length < String(previous ?? '').length;
};

/**
 * O estado do contador abaixo do campo.
 *
 * `over` é o caso que antes não existia na tela: nome acima do limite. Ele pede
 * uma mensagem diferente de "Limite máximo atingido", que diz "pare de digitar"
 * quando o que a pessoa precisa ouvir é "apague alguns caracteres".
 *
 * @param {string} value
 * @returns {'ok' | 'full' | 'over'}
 */
export const displayNameLengthState = (value) => {
  const tamanho = String(value ?? '').length;
  if (tamanho > DISPLAY_NAME_MAX_LENGTH) return 'over';
  if (tamanho === DISPLAY_NAME_MAX_LENGTH) return 'full';
  return 'ok';
};
