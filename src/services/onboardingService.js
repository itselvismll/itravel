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
 * Em caso de erro devolvemos `completed: true`: falha de rede não pode empurrar
 * o onboarding na cara de quem já usa o app.
 *
 * @param {string} userId
 * @returns {Promise<{ completed: boolean, error: string | null }>}
 */
export const getOnboardingStatus = async (userId) => {
  if (!userId) return { completed: true, error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { completed: true, error: error.message };

  // Perfil ainda não criado (trigger de cadastro em voo) não é conta antiga:
  // tratamos como onboarding pendente e a próxima leitura confirma.
  const completed = data ? data.onboarding_completed === true : false;
  writeCache(userId, completed);
  return { completed, error: null };
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
