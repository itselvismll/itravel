// Decide o que a conta logada ainda precisa ver antes do app: escolher username
// e/ou o onboarding de boas-vindas.
//
// A verdade é o perfil no Supabase (`onboarding_completed` e
// `username_confirmed`), lido numa única consulta. O cache local só adianta o
// caso "já concluiu o onboarding" para a tela não piscar enquanto a consulta
// está em voo — ele nunca faz nada APARECER por conta própria, e não vale para
// o username (só o banco sabe se aquele username foi escolhido ou derivado).
import { useCallback, useEffect, useState } from 'react';
import {
  adoptFormSignupUsername,
  completeOnboarding,
  confirmUsername,
  getOnboardingStatus,
  readCachedOnboardingCompleted,
} from '../services/onboardingService';
import { normalizeUsername } from '../utils/username';

/**
 * @param {{ id?: string, user_metadata?: { username?: string } } | null} user
 * @returns {{
 *   showOnboarding: boolean,
 *   usernamePending: boolean,
 *   suggestedUsername: string,
 *   checking: boolean,
 *   saving: boolean,
 *   dismissOnboarding: () => Promise<void>,
 *   saveUsername: (username: string) => Promise<{ success: boolean, error: string | null }>,
 * }}
 */
export default function useOnboardingGate(user) {
  const userId = user?.id || null;
  // Username digitado no cadastro por formulário. Só existe para quem se
  // cadastrou por e-mail; quem entrou pelo Google não tem esse campo.
  const requestedUsername = normalizeUsername(user?.user_metadata?.username);

  const [pending, setPending] = useState(false);
  const [usernamePending, setUsernamePending] = useState(false);
  const [suggestedUsername, setSuggestedUsername] = useState('');
  const [checking, setChecking] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setPending(false);
      setUsernamePending(false);
      setChecking(false);
      return undefined;
    }

    // Quem já concluiu o onboarding nunca entra em estado de checagem: o app
    // abre direto. Vale também para o username — a confirmação acontece ANTES
    // dos slides, então onboarding concluído implica username confirmado.
    if (readCachedOnboardingCompleted(userId)) {
      setPending(false);
      setUsernamePending(false);
      setChecking(false);
      return undefined;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      const status = await getOnboardingStatus(userId);
      if (cancelled) return;

      let { usernameConfirmed } = status;

      // Cadastro por formulário: o username do perfil é o que a pessoa digitou,
      // então já está confirmado — marcamos e seguimos direto para os slides.
      if (!usernameConfirmed && requestedUsername) {
        const adopted = await adoptFormSignupUsername(
          userId,
          status.username,
          requestedUsername
        );
        if (cancelled) return;
        if (adopted) usernameConfirmed = true;
      }

      setUsernamePending(!usernameConfirmed);
      setSuggestedUsername(status.username || '');
      setPending(!status.completed);
      setChecking(false);
    })();

    return () => { cancelled = true; };
  }, [userId, requestedUsername]);

  /**
   * Fecha o onboarding — vale tanto para concluir quanto para pular.
   *
   * A tela sai antes da resposta do banco: segurar o usuário num spinner por uma
   * gravação que já está cacheada localmente seria atrito puro. Se o update
   * falhar, a próxima leitura do perfil traz o onboarding de volta, que é o
   * comportamento correto para uma conta que de fato ainda não o concluiu.
   */
  const dismissOnboarding = useCallback(async () => {
    setPending(false);
    if (!userId) return;
    setSaving(true);
    await completeOnboarding(userId);
    setSaving(false);
  }, [userId]);

  /**
   * Grava o username escolhido. Aqui NÃO usamos o padrão otimista do
   * `dismissOnboarding`: se o nome tiver sido levado por outra pessoa entre a
   * checagem e o update, o usuário precisa continuar na tela e escolher outro.
   *
   * @param {string} username
   */
  const saveUsername = useCallback(async (username) => {
    if (!userId) return { success: false, error: 'Usuário não autenticado.' };

    setSaving(true);
    const result = await confirmUsername(userId, normalizeUsername(username));
    setSaving(false);

    if (result.success) setUsernamePending(false);
    return result;
  }, [userId]);

  return {
    showOnboarding: Boolean(userId) && pending,
    usernamePending: Boolean(userId) && usernamePending,
    suggestedUsername,
    checking,
    saving,
    dismissOnboarding,
    saveUsername,
  };
}
