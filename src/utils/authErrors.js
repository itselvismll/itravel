// O erro do Supabase Auth, traduzido para uma chave nossa.
//
// POR QUE ISTO EXISTE
//
// Boa parte do texto que a pessoa lê nas telas de conta não é string nossa: vem
// do GoTrue, em inglês, com redação que muda entre versões. Isso cria DOIS
// problemas, e este módulo fecha os dois.
//
// 1. NÃO TRADUZ. "Invalid login credentials" fica em inglês num app em
//    português, e continuaria em inglês num app em espanhol.
//
// 2. VAZA DETALHE INTERNO. Repassar o texto cru conta ao usuário — e a quem
//    estiver olhando por cima do ombro — coisas sobre a infraestrutura: nome de
//    provedor, estado de configuração, por vezes fragmento de SQL. A auditoria
//    de segurança registrou isso como item de baixa prioridade, e o caminho que
//    de fato vazava era o cadastro: `RegisterScreen` casava três padrões e, não
//    casando nenhum, mandava `result.error` inteiro para o diálogo.
//
// A regra agora é uma só: **nenhuma tela de conta mostra texto vindo do
// backend**. Casou um caso conhecido, mostra a chave correspondente; não casou,
// mostra a frase genérica COM UM CÓDIGO CURTO — que é o que permite a pessoa
// relatar o problema no suporte e alguém cruzar com o log, sem que a mensagem
// diga nada sobre o sistema.
//
// MÓDULO PURO: devolve CHAVE, não texto. Sem react-native, sem o contexto de
// idioma, exercitável no `node:test` sem browser — a mesma regra de
// `notificationCategories` e `notificationRouting`.
//
// ONDE O SUPABASE DOCUMENTA ISSO: os `code` vêm de
// https://supabase.com/docs/guides/auth/debugging/error-codes. Casamos por
// `code` PRIMEIRO e por texto só como rede, porque o código é estável e a
// redação não.

/** A chave usada quando nada casa. Sempre acompanhada de um código curto. */
export const AUTH_ERROR_FALLBACK_KEY = 'auth.errors.unknown';

/**
 * Os casos conhecidos, em ordem de avaliação.
 *
 * `code` é o campo do GoTrue; `pattern` é a rede para quando ele não vem (erro
 * de rede, versão antiga, resposta de proxy). O primeiro que casar ganha, então
 * a ordem importa: `captcha` fica no fim porque a palavra aparece em mensagens de
 * outros erros.
 */
const KNOWN_ERRORS = Object.freeze([
  {
    key: 'auth.errors.invalidCredentials',
    codes: ['invalid_credentials'],
    pattern: /invalid login credentials/i,
  },
  {
    key: 'auth.errors.emailNotConfirmed',
    codes: ['email_not_confirmed'],
    pattern: /email not confirmed/i,
  },
  {
    key: 'auth.errors.userAlreadyExists',
    codes: ['user_already_exists', 'email_exists'],
    pattern: /already registered|already been registered|user already exists/i,
  },
  {
    key: 'auth.errors.weakPassword',
    codes: ['weak_password'],
    pattern: /password should be at least|password is too weak|weak password/i,
  },
  {
    key: 'auth.errors.rateLimit',
    codes: ['over_request_rate_limit', 'over_email_send_rate_limit'],
    // O `429` solto importa: limite de taxa chega com frequência do gateway, sem
    // `code` e sem mensagem — só o status. A primeira versão deste módulo tinha
    // só `rate.?limit|too many requests` e deixava esse caso cair no genérico,
    // que é regressão em relação ao `formatLoginError` que existia antes (ele já
    // casava `429`). O teste pegou.
    //
    // `\b429\b` e não `429`: sem as bordas, um código como "HTTP_4290" ou um id
    // de requisição que contenha 429 viraria "muitas tentativas".
    pattern: /rate.?limit|too many|\b429\b/i,
  },
  {
    key: 'auth.errors.userBanned',
    codes: ['user_banned'],
    pattern: /user is banned/i,
  },
  {
    // Rede é o único caso que NÃO é culpa da conta, e merece texto próprio: a
    // frase genérica mandaria a pessoa ao suporte quando o problema é o wi-fi.
    key: 'auth.errors.network',
    codes: [],
    pattern: /failed to fetch|network request failed|load failed|networkerror/i,
  },
  {
    key: 'auth.errors.captcha',
    codes: ['captcha_failed'],
    pattern: /captcha/i,
  },
]);

/**
 * Um código curto e seguro para a pessoa citar no suporte.
 *
 * Só `[A-Z0-9_-]`, no máximo 40 caracteres: é o que garante que nada do texto do
 * backend atravesse por aqui. Uma mensagem inteira transformada em "código"
 * continuaria sendo a mensagem inteira.
 *
 * @param {{ code?: unknown, status?: unknown }} result
 * @returns {string}
 */
export const authErrorCode = ({ code, status } = {}) => {
  const bruto = String(code || (status ? `HTTP_${status}` : '') || 'AUTH_FAILED');
  const limpo = bruto.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().slice(0, 40);
  return limpo || 'AUTH_FAILED';
};

/**
 * O erro do Supabase, como chave de tradução.
 *
 * Devolve também o código, porque a frase genérica o interpola — e quem chama não
 * deve precisar saber qual das duas situações ocorreu para montar a mensagem.
 *
 * @param {{ error?: unknown, code?: unknown, status?: unknown }} [result]
 * @returns {{ key: string, code: string | null }} `code` só quando é o fallback
 */
export const authErrorKey = (result = {}) => {
  const { error, code, status } = result;
  const message = String(error || '');
  const normalizedCode = String(code || '').toLowerCase();
  // O status entra na busca por texto porque 429 às vezes chega sem `code`.
  const procurarEm = `${normalizedCode} ${message} ${status ?? ''}`;

  for (const conhecido of KNOWN_ERRORS) {
    if (conhecido.codes.includes(normalizedCode)) return { key: conhecido.key, code: null };
    if (conhecido.pattern.test(procurarEm)) return { key: conhecido.key, code: null };
  }

  return { key: AUTH_ERROR_FALLBACK_KEY, code: authErrorCode(result) };
};

/**
 * A mensagem pronta para a tela.
 *
 * @param {{ error?: unknown, code?: unknown, status?: unknown }} result
 * @param {(key: string, options?: object) => string} t
 * @returns {string}
 */
export const authErrorMessage = (result, t) => {
  const { key, code } = authErrorKey(result);
  return code ? t(key, { code }) : t(key);
};
