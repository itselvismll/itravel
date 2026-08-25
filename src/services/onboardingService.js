// Gatilho do onboarding de boas-vindas.
//
// A fonte de verdade é `profiles.onboarding_completed` no Supabase — nunca o
// storage local. O cache existe só para evitar o piscar do onboarding enquanto a
// consulta ao banco está em voo em quem JÁ concluiu; ele nunca decide sozinho
// que o onboarding deve APARECER.
import { Platform } from 'react-native';
import { supabase } from './supabase';

const CACHE_PREFIX = 'journi.onboarding.completed.';

// Marca de PASSO, não de conclusão: diz que os slides já foram vistos e que o
// usuário está na ação guiada. Pode viver só no dispositivo porque a pergunta
// que ela responde ("mostro slides ou o card do globo?") só vale enquanto o
// banco ainda diz `onboarding_completed = false`. Sem ela, um F5 no meio da ação
// guiada devolveria os três slides.
const SLIDES_PREFIX = 'journi.onboarding.slides.';

const storage = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Safari em navegação privada e iframes com storage bloqueado.
    return null;
  }
};

/** Cache otimista: `true` = já concluiu; `false` = não sabemos. */
export const readCachedOnboardingCompleted = (userId) => {
  if (!userId) return false;
  try {
    return storage()?.getItem(`${CACHE_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
};

const writeCache = (userId, completed) => {
  if (!userId) return;
  try {
    const store = storage();
    if (!store) return;
    if (completed) store.setItem(`${CACHE_PREFIX}${userId}`, '1');
    else store.removeItem(`${CACHE_PREFIX}${userId}`);
  } catch {
    // Storage indisponível não pode quebrar o fluxo — o banco continua sendo a verdade.
  }
};

/** O usuário já passou pelos slides e está na ação guiada? */
export const readSlidesSeen = (userId) => {
  if (!userId) return false;
  try {
    return storage()?.getItem(`${SLIDES_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
};

/** @param {string} userId @param {boolean} seen */
export const writeSlidesSeen = (userId, seen) => {
  if (!userId) return;
  try {
    const store = storage();
    if (!store) return;
    if (seen) store.setItem(`${SLIDES_PREFIX}${userId}`, '1');
    else store.removeItem(`${SLIDES_PREFIX}${userId}`);
  } catch {
    // Sem storage o onboarding ainda funciona; só perde a retomada no refresh.
  }
};

/**
 * Estado do onboarding para um usuário, direto do perfil.
 *
 * Traz `username_confirmed` na mesma consulta: as duas flags decidem a mesma
 * coisa (qual etapa de boas-vindas mostrar) e não vale um segundo round-trip
 * para ler outra coluna da mesma linha.
 *
 * Em caso de erro devolvemos tudo como concluído: falha de rede não pode
 * empurrar o onboarding — nem um pedido de username — na cara de quem já usa o
 * app.
 *
 * @param {string} userId
 * @returns {Promise<{
 *   completed: boolean,
 *   usernameConfirmed: boolean,
 *   username: string | null,
 *   error: string | null,
 * }>}
 */
export const getOnboardingStatus = async (userId) => {
  if (!userId) {
    return { completed: true, usernameConfirmed: true, username: null, error: null };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed, username_confirmed, username')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return { completed: true, usernameConfirmed: true, username: null, error: error.message };
  }

  // Perfil ainda não criado (trigger de cadastro em voo) não é conta antiga:
  // tratamos como onboarding pendente e a próxima leitura confirma.
  const completed = data ? data.onboarding_completed === true : false;
  writeCache(userId, completed);

  return {
    completed,
    // Sem perfil ainda não dá para pedir username — não há o auto-gerado para
    // pré-preencher o campo. A próxima leitura resolve.
    usernameConfirmed: data ? data.username_confirmed === true : true,
    username: data?.username ?? null,
    error: null,
  };
};

/**
 * Grava o username escolhido e encerra a etapa de confirmação.
 *
 * Um único update: username e flag andam juntos, e uma falha no meio deixaria a
 * conta com username novo e a tela reaparecendo no próximo login.
 *
 * @param {string} userId
 * @param {string} username já normalizado por src/utils/username.js
 * @returns {Promise<{ success: boolean, error: string | null }>}
 */
export const confirmUsername = async (userId, username) => {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };

  const { error } = await supabase
    .from('profiles')
    .update({ username, username_confirmed: true })
    .eq('id', userId);

  if (error) {
    // Corrida com outro cadastro que levou o mesmo username entre a checagem de
    // disponibilidade e o update.
    const duplicate = /duplicate key|unique/i.test(error.message);
    return {
      success: false,
      error: duplicate ? 'Este username acabou de ser usado. Escolha outro.' : error.message,
    };
  }

  return { success: true, error: null };
};

/**
 * Cadastro por formulário já escolheu username — não faz sentido pedir de novo.
 *
 * O ideal seria marcar isso ao fim do cadastro, mas ali ainda não há sessão (o
 * fluxo passa pela confirmação de e-mail), e sem sessão o RLS barra o update.
 * Então marcamos no primeiro login: se o username do perfil é exatamente o que
 * a pessoa digitou no cadastro (guardado em `user_metadata.username` pelo
 * `signUp`), foi escolha dela.
 *
 * O trigger continua sem citar `username_confirmed` de propósito — foi o
 * acoplamento a uma coluna nova que derrubou todo o cadastro em 21/08.
 *
 * @param {string} userId
 * @param {string | null} profileUsername
 * @param {string | null} requestedUsername vindo de user_metadata.username
 * @returns {Promise<boolean>} true se a conta pode pular a tela de username
 */
export const adoptFormSignupUsername = async (userId, profileUsername, requestedUsername) => {
  if (!userId || !profileUsername || !requestedUsername) return false;
  if (profileUsername !== requestedUsername) return false;

  const { error } = await supabase
    .from('profiles')
    .update({ username_confirmed: true })
    .eq('id', userId);

  // Falhou? A tela aparece uma vez com o username certo pré-preenchido; é só
  // confirmar. Preferível a engolir o erro e pedir de novo a cada login.
  return !error;
};

/**
 * Marca o onboarding como concluído — tanto ao finalizar quanto ao pular.
 *
 * @param {string} userId
 * @returns {Promise<{ success: boolean, error: string | null }>}
 */
export const completeOnboarding = async (userId) => {
  if (!userId) return { success: false, error: 'Usuário não autenticado.' };

  // Grava o cache antes da rede: quem pulou não pode ver o onboarding de novo
  // num refresh só porque a resposta demorou.
  writeCache(userId, true);
  // A marca de passo já cumpriu o papel dela.
  writeSlidesSeen(userId, false);

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
};
