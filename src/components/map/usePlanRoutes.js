// Dispara a otimização e o traçado do roteiro e devolve o resultado ao mapa.
//
// A divisão de sempre: mapboxRouting.js sabe CONVERSAR com o Mapbox, este hook
// sabe QUANDO — e, principalmente, sabe desistir. O roteiro já está desenhado na
// ordem da IA quando estas chamadas saem; o que volta é refinamento.
//
// Por isso o resultado chega EM PARTES, um dia de cada vez: um roteiro de duas
// semanas leva alguns segundos para percorrer todos os dias, e não há razão para
// segurar o dia 1 pronto esperando o dia 14. Cada `onDay` repinta só o que mudou.
import { useEffect, useState } from 'react';
import { buildPlanRoutes } from '../../services/mapboxRouting';

/**
 * @param {Array<any>} points pontos achatados do roteiro (getPlanPoints)
 * @param {string | null} planId troca de roteiro reinicia o trabalho
 * @returns {{ routes: Map<number, any> | null, pending: boolean }}
 */
export default function usePlanRoutes(points, planId) {
  const [routes, setRoutes] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!points?.length) {
      setRoutes(null);
      setPending(false);
      return undefined;
    }

    // Roteiro novo começa sem rota nenhuma: manter a do anterior desenharia o
    // caminho de outra cidade por cima dos pinos destes pontos.
    setRoutes(null);
    setPending(true);

    const controller = new AbortController();
    // Acumulador próprio: o setState do React é assíncrono, e ler o estado
    // anterior a cada dia perderia atualizações quando dois dias voltam juntos.
    const partial = new Map();

    buildPlanRoutes(points, {
      signal: controller.signal,
      onDay: (day, result) => {
        if (controller.signal.aborted) return;
        partial.set(day, result);
        // Map novo a cada dia: o mesmo objeto mutado não mudaria de identidade e
        // o useMemo do desenho não recalcularia.
        setRoutes(new Map(partial));
      },
    })
      .then((all) => {
        if (controller.signal.aborted) return;
        setRoutes(all);
        setPending(false);
      })
      // buildPlanRoutes não rejeita — este catch é a rede de segurança para o
      // caso de um erro de programação nosso não deixar a tela em "carregando"
      // para sempre.
      .catch(() => {
        if (!controller.signal.aborted) setPending(false);
      });

    return () => controller.abort();
  }, [points, planId]);

  return { routes, pending };
}
