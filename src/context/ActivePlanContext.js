// Roteiro aplicado no globo, compartilhado entre as duas telas que o tocam.
//
// A tela de roteiros salvos (dentro do ProfileStack) é quem APLICA; o globo
// (dentro da tab Map) é quem DESENHA. São ramos diferentes da navegação, então o
// estado precisa viver acima dos dois — o provider fica no App.js, ao lado do
// UploadProvider.
//
// A fonte da verdade da PERSISTÊNCIA é o Supabase (coluna is_active_on_map) com
// fallback em localStorage para os roteiros local_only; ver activePlanService.
// Aqui dentro o estado é otimista: aplicar redesenha o globo na hora e a
// gravação segue por baixo. Se ela falhar, o estado volta para o que estava —
// um roteiro plotado que o banco não conhece reapareceria errado no próximo boot.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSavedTripPlans } from '../services/tripPlanService';
import { nextActivePlan, setActivePlanOnMap } from '../services/activePlanService';
import { getPlanPoints } from '../utils/planGeography';
import { supabase } from '../services/supabase';

const ActivePlanContext = createContext(/** @type {any} */ (null));

export function ActivePlanProvider({ children }) {
  const [activePlan, setActivePlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getSavedTripPlans();
    // `nextActivePlan` decide entre adotar a resposta e manter o que está na
    // tela. Ler o resultado direto aqui foi o que deixou o globo limpar sozinho
    // quando a releitura falhava — ver o cabeçalho da função.
    setActivePlan((current) => nextActivePlan(current, result));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Quem está logado agora. É a identidade do CONJUNTO de roteiros — e é o que
  // decide se vale a pena reler.
  const currentUserIdRef = useRef(null);

  // Entrar e sair da conta troca o conjunto de roteiros: sem isto, o globo
  // continuaria mostrando o roteiro de quem acabou de sair.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        currentUserIdRef.current = null;
        setActivePlan(null);
        return;
      }

      if (event !== 'SIGNED_IN' && !(event === 'INITIAL_SESSION' && session?.user)) return;

      // `SIGNED_IN` NÃO quer dizer "alguém acabou de entrar".
      //
      // O auth-js emite esse mesmo evento quando recupera a sessão ao voltar do
      // background (visibilitychange → visible, em GoTrueClient), e isso
      // acontece toda vez que o usuário sai para o app de mapas e volta. Tratar
      // a volta como troca de conta fazia o app reler os roteiros no pior
      // momento possível — o instante em que a rede ainda está se recuperando.
      //
      // O que interessa é a conta ter MUDADO. Continuando a mesma, não há
      // conjunto novo para buscar: o que está na tela continua valendo.
      const userId = session?.user?.id ?? null;
      if (userId && userId === currentUserIdRef.current) return;

      currentUserIdRef.current = userId;
      refresh();
    });
    return () => data?.subscription?.unsubscribe();
  }, [refresh]);

  const applyToMap = useCallback(async (plan) => {
    if (!plan?.id) return { success: false, error: 'Roteiro sem identificador.' };

    const previous = activePlan;
    setActivePlan(plan);

    const result = await setActivePlanOnMap(plan.id);
    if (!result.success) setActivePlan(previous);
    return result;
  }, [activePlan]);

  const removeFromMap = useCallback(async () => {
    const previous = activePlan;
    setActivePlan(null);

    const result = await setActivePlanOnMap(null);
    if (!result.success) setActivePlan(previous);
    return result;
  }, [activePlan]);

  // Os pontos são derivados uma vez por roteiro, não a cada render do globo:
  // getPlanPoints achata e ordena todos os dias, e o resultado alimenta o
  // `buildPlanRouteData` da camada do mapa.
  const points = useMemo(
    () => (activePlan?.plan_data ? getPlanPoints(activePlan.plan_data) : []),
    [activePlan]
  );

  const value = useMemo(
    () => ({
      activePlan,
      activePlanId: activePlan?.id || null,
      points,
      loading,
      applyToMap,
      removeFromMap,
      refresh,
    }),
    [activePlan, points, loading, applyToMap, removeFromMap, refresh]
  );

  return <ActivePlanContext.Provider value={value}>{children}</ActivePlanContext.Provider>;
}

/**
 * Estado do roteiro aplicado no globo.
 *
 * Devolve um valor inerte fora do provider — o mesmo padrão do onboarding: uma
 * tela isolada (teste, storybook) não deve quebrar por não ter o provider.
 */
export const useActivePlan = () => useContext(ActivePlanContext) || {
  activePlan: null,
  activePlanId: null,
  points: [],
  loading: false,
  applyToMap: async () => ({ success: false }),
  removeFromMap: async () => ({ success: false }),
  refresh: async () => {},
};
