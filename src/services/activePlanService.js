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
 * O que o globo deve mostrar depois de uma releitura dos roteiros.
 *
 * O BUG QUE ESTA FUNÇÃO EXISTE PARA IMPEDIR
 *
 * O estado "qual roteiro está aplicado" era reconstruído a cada releitura, e
 * QUALQUER imperfeição na leitura virava "nenhum roteiro aplicado": o mapa
 * limpava sozinho. O caminho mais fácil de provocar isso é sair do app e voltar
 * — abrir a rota no Google Maps, por exemplo. Na volta, o auth-js recupera a
 * sessão e emite `SIGNED_IN`; o app relê os roteiros; e a primeira requisição
 * depois de retomar é justamente a que mais falha (socket morto, token em
 * renovação, rede ainda acordando). Falhou, roteiro some do globo.
 *
 * A regra aqui separa as três respostas possíveis, que antes eram duas:
 *
 *   • leitura boa  → vale o que ela diz, inclusive "nenhum" (quem removeu o
 *                    roteiro do mapa em outro aparelho precisa ver isso aqui);
 *   • leitura ruim → NÃO se sabe nada de novo; fica o que já estava na tela;
 *   • leitura parcial (`activeUnknown`) → a lista veio, mas sem a informação de
 *                    qual está aplicado. Também é "não se sabe", não é "nenhum".
 *
 * @param {object | null} current roteiro aplicado agora
 * @param {{ success?: boolean, data?: Array<any>, activeUnknown?: boolean }} result
 *   o que getSavedTripPlans devolveu
 * @returns {object | null}
 */
export const nextActivePlan = (current, result) => {
  if (!result?.success) return current ?? null;
  if (result.activeUnknown) return current ?? null;
  return resolveActivePlan(result.data);
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
