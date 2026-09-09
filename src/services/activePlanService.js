// Qual roteiro está aplicado no globo.
//
// Só um por vez. Quem garante isso no banco é o índice único parcial
// `travel_plans_one_active_on_map_idx` mais a RPC `set_active_plan_on_map`, que
// desativa o anterior e ativa o novo na mesma transação (ver a migração
// 20260901120000_travel_plans_active_on_map.sql).
//
// Roteiro `local_only` não existe no Supabase — ele vive no localStorage do
// dispositivo, quando o salvamento remoto falhou. Para esses o ativo é guardado
// aqui, em `journi.activePlanOnMap`. As duas origens são mantidas EXCLUSIVAS
// entre si: aplicar um local limpa a flag remota e vice-versa, senão o globo
// teria dois candidatos a "o roteiro ativo".
import { supabase } from './supabase';

const LOCAL_ACTIVE_KEY = 'journi.activePlanOnMap';

/** Ids locais nascem em saveLocalPlan como `local-<timestamp>`. */
export const isLocalPlanId = (planId) =>
  typeof planId === 'string' && planId.startsWith('local-');

const readLocalActiveId = () => {
  if (typeof globalThis.localStorage === 'undefined') return null;
  try {
    return globalThis.localStorage.getItem(LOCAL_ACTIVE_KEY) || null;
  } catch {
    return null;
  }
};

const writeLocalActiveId = (planId) => {
  if (typeof globalThis.localStorage === 'undefined') return;
  try {
    if (planId) globalThis.localStorage.setItem(LOCAL_ACTIVE_KEY, planId);
    else globalThis.localStorage.removeItem(LOCAL_ACTIVE_KEY);
  } catch {
    // Sem localStorage (modo privado, WebView restrita) o roteiro local
    // simplesmente não sobrevive ao recarregamento — o globo continua funcionando.
  }
};

/** Limpa ou define a flag no Supabase. Silencioso quando não há sessão. */
const setRemoteActivePlan = async (planId) => {
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user) return { success: true };

  const { error } = await supabase.rpc('set_active_plan_on_map', {
    p_plan_id: planId ?? null,
  });
  return { success: !error, error: error?.message };
};

/**
 * Escolhe, na lista já carregada de roteiros, qual está aplicado no globo.
 *
 * A lista vem de `getSavedTripPlans`, que junta os locais com os do Supabase —
 * então este é o único lugar que precisa conhecer as duas origens. O ativo local
 * tem precedência apenas porque só um dos dois pode estar marcado por vez.
 *
 * @param {Array<{ id: string, is_active_on_map?: boolean }>} plans
 * @returns {object | null}
 */
export const resolveActivePlan = (plans) => {
  const list = plans ?? [];
  const localId = readLocalActiveId();

  if (localId) {
    const localPlan = list.find((plan) => plan?.id === localId);
    // O roteiro pode ter sido excluído desde a última sessão: a chave órfã sai
    // daqui em vez de ficar apontando para nada até alguém aplicar outro.
    if (localPlan) return localPlan;
    writeLocalActiveId(null);
  }

  return list.find((plan) => plan?.is_active_on_map) || null;
};

/**
 * Aplica um roteiro no globo (ou remove o atual, com `planId` nulo).
 *
 * @param {string | null} planId
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export const setActivePlanOnMap = async (planId) => {
  if (!planId) {
    writeLocalActiveId(null);
    return setRemoteActivePlan(null);
  }

  if (isLocalPlanId(planId)) {
    writeLocalActiveId(planId);
    // Nenhum roteiro remoto pode continuar marcado enquanto um local está no ar.
    return setRemoteActivePlan(null);
  }

  writeLocalActiveId(null);
  return setRemoteActivePlan(planId);
};
