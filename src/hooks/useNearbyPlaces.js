// "O que tem por perto" enquanto uma parada do roteiro está aberta: a área
// alcançável a pé e a lista dos lugares dentro dela.
//
// Duas chamadas de rede que saem JUNTAS e chegam separadas, porque uma não
// depende da outra: a isócrona desenha a área, a Search Box lista os lugares.
// Esperar as duas para mostrar qualquer coisa deixaria a folha em branco pelo
// tempo da mais lenta, e a área — que é o que o usuário pediu — costuma voltar
// primeiro.
//
// O hook é React puro: sem DOM, sem mapa, sem `maplibre-gl`. Ele roda igual na
// GlobeScreen web e na GlobeScreen do iOS/Android — que é o ponto, já que o
// estado da folha mora no React Native nas duas plataformas e o mapa só recebe a
// área pronta para desenhar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchIsochrone, DEFAULT_ISOCHRONE_MINUTES } from '../services/mapboxIsochrone';
import { fetchNearbyPlaces } from '../services/mapboxPlaces';
import { geometryBounds } from '../utils/geoMeasure';
import { selectNearbyPlaces, NEARBY_MAX_COUNT } from '../utils/nearbyPlaces';

/** Nada pedido ainda, ou parada fechada. Referência estável: ela entra no
 * retorno do hook e um objeto novo a cada render re-renderizaria a folha. */
const IDLE = { area: null, places: [], loading: false, failed: false };

/**
 * @param {{
 *   latitude: number,
 *   longitude: number,
 *   title?: string,
 * } | null} stop parada aberta; `null` fecha e cancela o que estiver em voo
 * @param {{ minutes?: number }} [options]
 * @returns {{
 *   area: any,
 *   places: Array<any>,
 *   loading: boolean,
 *   failed: boolean,
 *   minutes: number,
 * }}
 */
export default function useNearbyPlaces(stop, options = {}) {
  const { minutes = DEFAULT_ISOCHRONE_MINUTES } = options;
  const [state, setState] = useState(IDLE);

  // A chave é a identidade da parada para este hook: duas paradas diferentes na
  // mesma coordenada são a mesma pergunta. Sem ela, um objeto novo vindo do
  // render do pai refaria as duas chamadas a cada quadro.
  const key = stop ? `${stop.longitude},${stop.latitude}` : null;

  // O título entra na filtragem (tira o próprio lugar da lista) mas NÃO deve
  // refazer a busca sozinho — daí a ref em vez da dependência.
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    if (!key) {
      setState(IDLE);
      return undefined;
    }

    const origin = stopRef.current;
    const controller = new AbortController();
    setState({ area: null, places: [], loading: true, failed: false });

    let cancelled = false;

    // A área primeiro, sozinha: o bbox dela é o que recorta a busca de lugares
    // para o que realmente dá para alcançar a pé. Sem esse recorte a API gasta os
    // 25 resultados com o bairro vizinho e a lista volta vazia com a área cheia.
    fetchIsochrone(
      { longitude: origin.longitude, latitude: origin.latitude },
      { minutes, signal: controller.signal }
    )
      .then(async (area) => {
        if (cancelled) return;

        // A área já pode ser desenhada — não há razão para segurá-la até os
        // lugares chegarem.
        setState((current) => ({ ...current, area: area || null }));

        const places = await fetchNearbyPlaces(
          { longitude: origin.longitude, latitude: origin.latitude },
          {
            bbox: geometryBounds(area?.geometry),
            limit: NEARBY_MAX_COUNT * 2,
            signal: controller.signal,
          }
        );
        if (cancelled) return;

        setState((current) => ({
          area: current.area,
          places: selectNearbyPlaces(places, {
            origin: {
              longitude: origin.longitude,
              latitude: origin.latitude,
              title: origin.title,
            },
            area: current.area,
          }),
          loading: false,
          // Só é falha quando as DUAS metades falharam. Área sem lista ainda
          // responde "até onde dá para ir"; lista sem área ainda responde "o que
          // tem". O aviso é para quando não sobrou nada.
          failed: !current.area && places === null,
        }));
      })
      // Nem fetchIsochrone nem fetchNearbyPlaces rejeitam — este catch é a rede
      // de segurança para um erro de programação nosso não deixar a folha
      // girando para sempre.
      .catch(() => {
        if (!cancelled) setState({ area: null, places: [], loading: false, failed: true });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, minutes]);

  return useMemo(() => ({ ...state, minutes }), [state, minutes]);
}
