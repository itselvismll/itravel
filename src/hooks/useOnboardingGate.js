// Decide se o onboarding de boas-vindas deve aparecer para o usuário logado.
//
// A verdade é `profiles.onboarding_completed` no Supabase. O cache local só
// adianta o caso "já concluiu" para a tela não piscar o onboarding enquanto a
// consulta está em voo — ele nunca faz o onboarding APARECER por conta própria.
import { useCallback, useEffect, useState } from 'react';
import {
  completeOnboarding,
  getOnboardingStatus,
  readCachedOnboardingCompleted,
} from '../services/onboardingService';

/**
 * @param {{ id?: string } | null} user
 * @returns {{
 *   showOnboarding: boolean,
 *   checking: boolean,
 *   saving: boolean,
 *   dismissOnboarding: () => Promise<void>,
 * }}
 */
export default function useOnboardingGate(user) {
  const userId = user?.id || null;
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(Boolean(userId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setPending(false);
      setChecking(false);
      return undefined;
    }

    // Quem já concluiu nunca entra em estado de checagem: o app abre direto.
    if (readCachedOnboardingCompleted(userId)) {
      setPending(false);
      setChecking(false);
      return undefined;
    }

    let cancelled = false;
    setChecking(true);

    getOnboardingStatus(userId).then(({ completed }) => {
      if (cancelled) return;
      setPending(!completed);
      setChecking(false);
    });

    return () => { cancelled = true; };
  }, [userId]);

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

  return {
    showOnboarding: Boolean(userId) && pending,
    checking,
    saving,
    dismissOnboarding,
  };
}
