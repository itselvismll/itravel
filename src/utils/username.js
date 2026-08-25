// Regra ÚNICA de username do Journi.
//
// Existiam três regras divergentes: o cadastro aceitava maiúscula e não tinha
// máximo, a edição de perfil limitava a 10 caracteres, e o trigger do banco
// exigia ^[a-z0-9_]{3,30}$. Resultado: o que passava numa tela era rejeitado (ou
// alterado silenciosamente) na outra.
//
// Agora é este arquivo em todos os pontos do app — cadastro, edição de perfil e
// escolha de username do Google — e `public.normalize_username()` no banco
// espelha exatamente a mesma normalização em SQL. Mudou aqui, muda lá.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 10;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,10}$/;

/**
 * Deixa o texto na forma exata em que será salvo: minúsculas, sem acento, sem
 * espaço, apenas [a-z0-9_], no máximo 10 caracteres.
 *
 * As telas chamam isto no `onChangeText`, então o campo mostra o username real
 * enquanto o usuário digita — nada de "Matheus" virar "matheus" só depois de
 * salvar.
 *
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function normalizeUsername(raw) {
  return (raw ?? '')
    // NFD separa a letra do acento; o filtro [^a-z0-9_] abaixo descarta o acento solto.
    .normalize('NFD')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
}

/**
 * Valida um username já normalizado e devolve a mensagem pronta para a UI.
 *
 * Só checa formato — disponibilidade é uma ida ao banco
 * (`checkUsernameAvailable`), que as telas fazem em separado.
 *
 * @param {string | null | undefined} raw
 * @returns {{ valid: boolean, value: string, error: string | null }}
 */
export function validateUsername(raw) {
  const value = normalizeUsername(raw);

  if (!value) {
    return { valid: false, value, error: 'Nome de usuário é obrigatório' };
  }
  if (value.length < USERNAME_MIN_LENGTH) {
    return {
      valid: false,
      value,
      error: `Mínimo de ${USERNAME_MIN_LENGTH} caracteres`,
    };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return {
      valid: false,
      value,
      error: 'Use apenas letras minúsculas, números e underscore',
    };
  }

  return { valid: true, value, error: null };
}
