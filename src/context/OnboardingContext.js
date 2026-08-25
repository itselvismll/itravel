// Estado do onboarding de boas-vindas, compartilhado entre o overlay dos slides
// (que vive FORA do NavigationContainer) e a tela do globo (que vive dentro).
//
// O fluxo tem três passos e um único ponto de encerramento:
//
//   username ──▶ slides ──"Começar"──▶ guiado (globo) ──marcou o 1º país──▶ concluído
//                   │                      │
//                   └──────"Pular"─────────┴──────────"Pular"─────────────▶ concluído
//
// O passo `username` só existe para quem entrou pelo Google: o trigger derivou
// um username do nome da conta e a pessoa precisa aceitar ou trocar. Quem se
// cadastrou pelo formulário já escolheu o dele e cai direto nos slides. Esse
// passo NÃO tem "pular" — o username é público e não pode ficar indefinido.
//
// "Concluído" é sempre a mesma coisa: `profiles.onboarding_completed = true` no
// Supabase (ver onboardingService). Enquanto o usuário está no passo guiado o
// campo continua `false` de propósito — quem fechar o app no meio volta para o
// card guiado, não para o feed sem contexto.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import useOnboardingGate from '../hooks/useOnboardingGate';
import { readSlidesSeen, writeSlidesSeen } from '../services/onboardingService';
import { navigateFromOutside } from '../navigation/navigationRef';

/** @typedef {'done' | 'username' | 'slides' | 'guided'} OnboardingPhase */

const OnboardingContext = createContext(/** @type {any} */ (null));

/**
 * Fluxo completo do onboarding. Chamado UMA vez, no AppNavigator: ele precisa do
 * resultado direto (para o overlay dos slides e para segurar o boot) e ao mesmo
 * tempo precisa entregá-lo lá embaixo, na tela do globo.
 *
 * @param {{ id?: string } | null} user
 */
export function useOnboardingFlow(user) {
  const userId = user?.id || null;
  const {
    showOnboarding,
    usernamePending,
    suggestedUsername,
    checking,
    saving,
    dismissOnboarding,
    saveUsername,
  } = useOnboardingGate(user);
  const [slidesDone, setSlidesDone] = useState(false);

  // Retoma o passo em que o usuário estava. Quem recarregou a página no meio da
  // ação guiada volta para o card do globo, não para os três slides de novo.
  useEffect(() => {
    setSlidesDone(readSlidesSeen(userId));
  }, [userId]);

  // O username vem primeiro mesmo quando o onboarding já foi concluído: uma
  // conta do Google que pulou os slides ainda precisa confirmar o username.
  /** @type {OnboardingPhase} */
  const phase = usernamePending
    ? 'username'
    : (!showOnboarding ? 'done' : (slidesDone ? 'guided' : 'slides'));

  // Fim dos slides: o usuário vai para o globo, não para o feed. A primeira ação
  // do app é marcar um país, e é lá que ela acontece.
  const finishSlides = useCallback(() => {
    setSlidesDone(true);
    writeSlidesSeen(userId, true);
  }, [userId]);

  // Um efeito, e não uma chamada dentro do `finishSlides`, porque o passo guiado
  // tem duas entradas: terminar os slides agora e retomar o passo depois de um
  // refresh. Nas duas o usuário precisa estar no globo — o card guiado mora lá,
  // e a aba inicial do app é o feed.
  useEffect(() => {
    if (phase !== 'guided') return;
    navigateFromOutside('Main', { screen: 'Map' });
  }, [phase]);

  // Encerra o onboarding — vale para "pulei os slides", "pulei o card guiado" e
  // "marquei meu primeiro país". Os três terminam no mesmo lugar: o campo no
  // Supabase (o `dismissOnboarding` também limpa a marca de passo).
  const finishOnboarding = useCallback(() => {
    setSlidesDone(false);
    return dismissOnboarding();
  }, [dismissOnboarding]);

  return useMemo(() => ({
    phase,
    checking,
    saving,
    showUsername: phase === 'username',
    suggestedUsername,
    saveUsername,
    showSlides: phase === 'slides',
    guidedActive: phase === 'guided',
    finishSlides,
    finishOnboarding,
  }), [phase, checking, saving, suggestedUsername, saveUsername, finishSlides, finishOnboarding]);
}

/**
 * @param {{ value: ReturnType<typeof useOnboardingFlow>, children: React.ReactNode }} props
 */
export function OnboardingProvider({ value, children }) {
  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

/**
 * Acesso ao fluxo de dentro da árvore de navegação.
 *
 * Devolve um estado inerte quando não há provider — a tela do globo é usada por
 * qualquer usuário, e a esmagadora maioria nunca passa pelo onboarding.
 *
 * @returns {{ guidedActive: boolean, finishOnboarding: () => Promise<void> | void }}
 */
export function useOnboarding() {
  return useContext(OnboardingContext) ?? {
    guidedActive: false,
    finishOnboarding: () => {},
  };
}
