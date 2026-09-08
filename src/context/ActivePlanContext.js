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
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSavedTripPlans } from '../services/tripPlanService';
import { resolveActivePlan, setActivePlanOnMap } from '../services/activePlanService';
import { getPlanPoints } from '../utils/planGeography';
import { supabase } from '../services/supabase';

const ActivePlanContext = createContext(/** @type {any} */ (null));

export function ActivePlanProvider({ children }) {
  const [activePlan, setActivePlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getSavedTripPlans();
    setActivePlan(result.success ? resolveActivePlan(result.data) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Entrar e sair da conta troca o conjunto de roteiros: sem isto, o globo
  // continuaria mostrando o roteiro de quem acabou de sair.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setActivePlan(null);
        return;
      }
      // O INITIAL_SESSION entra só quando há sessão de verdade: a leitura do
      // mount pode ter acontecido antes de a sessão ser restaurada do storage, e
      // aí ela enxergou apenas os roteiros locais. Sem sessão não há nada de
      // novo para buscar, e o refresh seria uma segunda consulta idêntica.
      if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session?.user)) refresh();
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
