// As regras de e-mail e senha do cadastro — a REGRA, sem o texto.
//
// POR QUE SEPARAR
//
// Antes, cada requisito de senha existia em dois lugares que ninguém ligava: a
// condição (`password.length >= 8`) dentro de `validatePassword`, no
// `RegisterScreen`, e a frase ("Mínimo 8 caracteres") escrita à mão num `<Text>`
// quarenta linhas abaixo, numa lista de quatro blocos quase idênticos. Mudar o
// mínimo para 10 exigia achar os dois — e o segundo não quebra nada quando é
// esquecido: a tela simplesmente passa a mentir.
//
// Agora o requisito é UM objeto com a condição e a chave do texto juntas, e a
// tela percorre a lista. Acrescentar um requisito é acrescentar uma entrada aqui
// e uma chave nos três JSON; a tela não muda.
//
// MÓDULO PURO: condição e chave, sem react-native e sem o contexto de idioma.
// Quem resolve a chave é a tela.
//
// AS REGRAS NÃO MUDARAM NESTA EXTRAÇÃO. Mesmo mínimo, mesmas quatro condições,
// mesmo regex de e-mail — a fase 1 move texto, não comportamento.

/** O mínimo de caracteres. Citado no texto por interpolação, nunca copiado. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Validação de e-mail: só a forma, nada de confirmar existência.
 *
 * O regex é intencionalmente frouxo — "tem algo, arroba, algo, ponto, algo". Um
 * regex rigoroso de RFC 5322 recusa endereço válido (apóstrofo, acentuação, TLD
 * novo) e dá a quem se cadastra um "e-mail inválido" sobre um e-mail que
 * funciona. Quem confirma de verdade é o link que o Supabase manda.
 *
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

/**
 * Os requisitos da senha: condição e chave de texto, lado a lado.
 *
 * `labelKey` traz o `%{count}` do mínimo onde faz sentido, para a frase não
 * repetir o número que já está em `PASSWORD_MIN_LENGTH`.
 *
 * @type {ReadonlyArray<{ id: string, labelKey: string, test: (senha: string) => boolean }>}
 */
export const PASSWORD_REQUIREMENTS = Object.freeze([
  Object.freeze({
    id: 'minLength',
    labelKey: 'auth.password.requirements.minLength',
    test: (senha) => String(senha || '').length >= PASSWORD_MIN_LENGTH,
  }),
  Object.freeze({
    id: 'upperCase',
    labelKey: 'auth.password.requirements.upperCase',
    test: (senha) => /[A-Z]/.test(String(senha || '')),
  }),
  Object.freeze({
    id: 'lowerCase',
    labelKey: 'auth.password.requirements.lowerCase',
    test: (senha) => /[a-z]/.test(String(senha || '')),
  }),
  Object.freeze({
    id: 'number',
    labelKey: 'auth.password.requirements.number',
    test: (senha) => /[0-9]/.test(String(senha || '')),
  }),
]);

/**
 * O estado de cada requisito, para a tela desenhar a lista com os certinhos.
 *
 * @param {string} senha
 * @returns {{ isValid: boolean, requirements: Array<{ id: string, labelKey: string, met: boolean }> }}
 */
export const validatePassword = (senha) => {
  const requirements = PASSWORD_REQUIREMENTS.map(({ id, labelKey, test }) => ({
    id,
    labelKey,
    met: test(senha),
  }));

  return {
    isValid: requirements.every((r) => r.met),
    requirements,
  };
};
