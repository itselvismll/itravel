// Prende o ciclo de vida das layers do roteiro ao ciclo de vida do React, e
// abre o popup do ponto tocado.
//
// Mesma divisão de CountryFillLayer: planRoute.js sabe O QUE desenhar e como
// conversar com um mapa; aqui é só QUANDO. A única saída visual própria é o
// popup — que existe porque ele é DOM do MapLibre, e o React precisa de um
// portal para renderizar conteúdo do app lá dentro.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popup } from 'maplibre-gl';
import PlanPointPopup from './PlanPointPopup';
import {
  attachPlanRouteLayers,
  bindPlanPointClick,
  buildPlanRouteData,
  detachPlanRouteLayers,
  isStyleReady,
  planBounds,
  PLAN_HALO_LAYER_ID,
  PLAN_PIN_LAYER_ID,
  registerCategoryIcons,
  setPlanDayFilter,
  unregisterCategoryIcons,
  updatePlanRouteData,
} from './planRoute';
import usePlanRoutes from './usePlanRoutes';
import {
  attachIsochroneLayers,
  detachIsochroneLayers,
  updateIsochroneData,
} from './isochroneLayer';
import { fetchIsochrone, DEFAULT_ISOCHRONE_MINUTES } from '../../services/mapboxIsochrone';
import { notify } from '../../utils/dialogs';

// O popup do MapLibre nasce branco, com seta e sombra de mapa de rua. Aqui ele
// vira um cartão da identidade do Journi. Precisa ser CSS: os elementos nascem
// dentro do MapLibre, depois da montagem, e o React nunca os renderiza.
//
// A seta é escondida em vez de recolorida porque o MapLibre pinta uma borda
// diferente para cada âncora do popup — seriam oito regras para um triângulo de
// 10px. Um deslocamento do cartão dá a mesma leitura de "isto pertence àquele
// pino", sem a fragilidade.
const POPUP_CSS = `
.journi-plan-popup .maplibregl-popup-content {
  padding: 0;
  border-radius: 14px;
  background: rgba(13,19,38,0.96);
  border: 1px solid rgba(108,43,217,0.45);
  box-shadow: 0 10px 30px rgba(0,0,0,0.45);
}
.journi-plan-popup .maplibregl-popup-tip { display: none; }
`;

// Enquadramento do roteiro. O padding evita que um ponto encoste na borda (e
// fique atrás da barra de IA no topo); o maxZoom impede que um roteiro de um
// bairro só mergulhe até o nível da calçada.
// Aviso de falha da isócrona. Discreto de propósito: a área é um extra, e uma
// tela de erro para um extra que não carregou custa mais atenção do que vale.
const NEARBY_ERROR_TITLE = 'Área indisponível';
const NEARBY_ERROR_MESSAGE =
  'Não foi possível calcular o que dá para alcançar a pé daqui. Tente de novo em instantes.';

const FIT_PADDING = 72;
const FIT_MAX_ZOOM = 14;
const FIT_DURATION = 2000;
const SINGLE_POINT_ZOOM = 13;

/**
 * @param {{
 *   map: import('maplibre-gl').Map | null,
 *   points?: Array<any>,
 *   planId?: string | null,
 *   selectedDay?: number | null,
 * }} props
 */
export default function PlanRouteLayer({ map, points, planId, selectedDay = null }) {
  // Ordem otimizada e traçado real, quando o Mapbox responde. Chega em partes,
  // um dia por vez — e pode nunca chegar, que é o caso de fallback.
  const { routes } = usePlanRoutes(points, planId);

  // `routes` entra na dependência porque cada dia que volta redesenha aquele
  // dia: os pinos ganham a numeração da sequência otimizada e a reta tracejada
  // vira o caminho de rua.
  const data = useMemo(() => buildPlanRouteData(points, routes), [points, routes]);
  const hasPoints = Boolean(points?.length);

  // { properties, coordinates, container } — o container é o <div> que o
  // MapLibre hospeda e o portal preenche.
  const [popup, setPopup] = useState(null);
  const popupRef = useRef(null);

  // Área "o que tem por perto": o polígono no ar (ou null) e o pedido em voo.
  // A chave guarda de QUAL pino a área é — sem ela, abrir o popup de outro ponto
  // mostraria "Ocultar área" para uma área desenhada em volta do anterior.
  const [nearby, setNearby] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // O pedido em voo precisa ser cancelável de fora do handler que o criou
  // (troca de roteiro, desmontagem), e trocar de ref não deve re-renderizar.
  const nearbyRequestRef = useRef(null);

  const clearNearby = useCallback(() => {
    nearbyRequestRef.current?.abort();
    nearbyRequestRef.current = null;
    setNearbyLoading(false);
    setNearby(null);
  }, []);

  // O dia escolhido é lido dentro do `attach`, que roda em resposta a um evento
  // do mapa e não a um render. Uma ref é o que dá a ele o valor ATUAL sem
  // colocar `selectedDay` na dependência do efeito de montagem — que
  // remontaria todas as layers a cada troca de aba.
  const selectedDayRef = useRef(selectedDay);
  selectedDayRef.current = selectedDay;

  const closePopup = useCallback(() => {
    popupRef.current?.remove();
    popupRef.current = null;
    setPopup(null);
  }, []);

  /**
   * Pede a área a pé do ponto tocado, ou a esconde se ela já estiver no ar.
   *
   * O toggle mora aqui e não no popup porque quem sabe se a área desenhada é
   * DESTE pino é a chave — o popup só recebe a resposta pronta.
   */
  const toggleNearby = useCallback(async (coordinates) => {
    const key = `${coordinates?.[0]},${coordinates?.[1]}`;

    // Segundo toque no mesmo pino: esconde. Toque num pino diferente com área de
    // outro no ar: o pedido novo substitui a antiga, sem passar por vazio.
    if (nearby?.key === key) {
      clearNearby();
      return;
    }

    nearbyRequestRef.current?.abort();
    const controller = new AbortController();
    nearbyRequestRef.current = controller;
    setNearbyLoading(true);

    const feature = await fetchIsochrone(
      { longitude: coordinates?.[0], latitude: coordinates?.[1] },
      { minutes: DEFAULT_ISOCHRONE_MINUTES, signal: controller.signal }
    );

    // Um pedido cancelado não tem direito de mexer no estado: quem cancelou já
    // decidiu o que a tela deve mostrar.
    if (controller.signal.aborted) return;
    nearbyRequestRef.current = null;
    setNearbyLoading(false);

    // fetchIsochrone nunca lança: `null` cobre 403, timeout, cota e resposta
    // vazia. A tela segue como estava e o aviso é a única consequência.
    if (!feature) {
      notify(NEARBY_ERROR_TITLE, NEARBY_ERROR_MESSAGE);
      return;
    }

    setNearby({ key, feature });
  }, [nearby, clearNearby]);

  // Sem roteiro ativo as layers nem são criadas: o globo fica exatamente como
  // era antes desta feature. É por isso que `hasPoints` está na dependência —
  // remover o roteiro do mapa desmonta tudo em vez de deixar sources vazias.
  useEffect(() => {
    if (!map || !hasPoints) return undefined;

    const attach = () => {
      // As imagens de categoria vivem na style, não no mapa: uma troca de style
      // as leva junto, então elas são registradas no mesmo gatilho das layers.
      registerCategoryIcons(map);
      attachPlanRouteLayers(map, { data });
      // Layer recém-criada nasce sem filtro. Sem esta linha, uma troca de style
      // com um dia selecionado traria o roteiro inteiro de volta à tela.
      setPlanDayFilter(map, selectedDayRef.current);
    };

    // A style pode ainda não estar parseada (mapa criado, style em voo) e volta
    // ao estado cru numa troca de style. Nos dois casos 'style.load' é o gatilho
    // para montar de novo; quando ela já está pronta, `attach` roda agora e o
    // listener nunca dispara.
    if (!isStyleReady(map)) map.on('style.load', attach);
    else attach();

    return () => {
      map.off('style.load', attach);
      detachPlanRouteLayers(map);
      unregisterCategoryIcons(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `data` entra só na montagem; a troca de roteiro é o efeito abaixo
  }, [map, hasPoints]);

  // Aplicar OUTRO roteiro troca só os dados das sources: as layers continuam as
  // mesmas e nada é recriado. O attach acima cobre o caso de as sources ainda
  // não existirem (roteiro que chegou antes da style).
  useEffect(() => {
    if (!map || !hasPoints) return;
    if (!updatePlanRouteData(map, data)) attachPlanRouteLayers(map, { data });
  }, [map, data, hasPoints]);

  // Troca de dia: só o filtro das layers muda. A geometria já está no worker e
  // as chamadas do Mapbox não são refeitas.
  useEffect(() => {
    if (!map || !hasPoints) return;
    setPlanDayFilter(map, selectedDay);
  }, [map, hasPoints, selectedDay, data]);

  // O popup aponta para um ponto do roteiro anterior quando o roteiro troca —
  // e para um ponto escondido quando o dia filtrado muda.
  useEffect(() => {
    closePopup();
  }, [planId, selectedDay, closePopup]);

  // Layers da área. Efeito separado do roteiro porque o ciclo de vida é outro:
  // elas só existem enquanto há área no ar, e escondê-la não mexe no roteiro.
  useEffect(() => {
    if (!map || !nearby) return undefined;

    const attach = () => attachIsochroneLayers(map, { feature: nearby.feature });

    // Mesma escada do roteiro: style crua monta no 'style.load', style pronta
    // monta agora. Uma troca de style leva as layers junto e o listener as traz
    // de volta.
    if (!isStyleReady(map)) map.on('style.load', attach);
    else attach();

    return () => {
      map.off('style.load', attach);
      detachIsochroneLayers(map);
    };
  }, [map, nearby]);

  // Área nova no mesmo ciclo: troca só os dados, sem recriar as layers.
  useEffect(() => {
    if (!map || !nearby) return;
    updateIsochroneData(map, nearby.feature);
  }, [map, nearby]);

  // Trocar de roteiro ou de dia apaga a área junto com o popup: ela pertence a um
  // pino específico, e esse pino pode nem estar mais na tela.
  useEffect(() => {
    clearNearby();
  }, [planId, selectedDay, clearNearby]);

  // Toque em qualquer outro lugar do mapa esconde a área — o mesmo gesto que o
  // usuário já faz para fechar o popup. O listener é do MAPA e não de uma layer,
  // então ele recebe também os toques que caíram num pino; nesse caso o handler
  // do pino já tratou, e limpar aqui apagaria a área no instante em que ela foi
  // pedida. Daí o hit-test explícito antes de limpar.
  useEffect(() => {
    if (!map || !nearby) return undefined;

    const handleMapClick = (event) => {
      const layers = [PLAN_PIN_LAYER_ID, PLAN_HALO_LAYER_ID].filter((id) => map.getLayer?.(id));
      const hits = layers.length
        ? map.queryRenderedFeatures?.(event.point, { layers })
        : null;
      if (hits?.length) return;
      clearNearby();
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, nearby, clearNearby]);

  // Cancela o pedido em voo quando o componente sai ou o mapa é destruído.
  useEffect(() => clearNearby, [map, clearNearby]);

  // Toque no pino. Efeito próprio porque o listener é da LAYER: registrar antes
  // dela existir não pega nada.
  useEffect(() => {
    if (!map || !hasPoints) return undefined;

    return bindPlanPointClick(map, (properties, coordinates) => {
      if (!coordinates) return;

      popupRef.current?.remove();

      const container = document.createElement('div');
      const instance = new Popup({
        closeButton: false,
        // Fecha ao tocar fora, que é como um cartão discreto deve se comportar
        // num mapa. O listener interno do MapLibre entra no meio deste mesmo
        // clique, mas o Evented dispara sobre uma cópia da lista de ouvintes —
        // o popup não se fecha no instante em que abre.
        closeOnClick: true,
        offset: 18,
        maxWidth: '260px',
        className: 'journi-plan-popup',
      })
        .setLngLat(coordinates)
        .setDOMContent(container)
        .addTo(map);

      instance.on('close', () => {
        // Só limpa se ainda for ESTE popup: abrir outro pino remove o anterior e
        // dispara o 'close' dele depois do novo já estar no ar.
        if (popupRef.current === instance) popupRef.current = null;
        setPopup((current) => (current?.container === container ? null : current));
      });

      popupRef.current = instance;
      setPopup({ properties, coordinates, container });
    });
  }, [map, hasPoints]);

  // Leva a câmera até o roteiro. Ao abrir, enquadra a viagem inteira — que na
  // prática é a cidade do roteiro, porque é onde os pontos estão. Ao escolher um
  // dia, fecha no trajeto daquele dia.
  //
  // Depende do `planId` e do `selectedDay`, nunca dos pontos: reenquadrar a cada
  // atualização dos dados roubaria a câmera de quem está navegando pelo globo —
  // e os dados mudam sozinhos, a cada dia que o Mapbox devolve.
  useEffect(() => {
    if (!map || !planId) return;

    const framed = Number.isFinite(selectedDay)
      ? points.filter((point) => Number(point?.day) === Number(selectedDay))
      : points;

    const bounds = planBounds(framed);
    if (!bounds) return;

    const [[west, south], [east, north]] = bounds;
    // Roteiro de um ponto só não tem caixa: fitBounds de área zero cairia no
    // zoom máximo do mapa.
    if (west === east && south === north) {
      map.flyTo({ center: [west, south], zoom: SINGLE_POINT_ZOOM, duration: FIT_DURATION });
      return;
    }

    map.fitBounds(bounds, {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      duration: FIT_DURATION,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a troca de roteiro ou de dia move a câmera
  }, [map, planId, selectedDay]);

  // Fecha o popup quando o componente sai ou o mapa é destruído.
  useEffect(() => closePopup, [map, closePopup]);

  if (!popup) return null;

  return (
    <>
      <style>{POPUP_CSS}</style>
      {createPortal(
        <PlanPointPopup
          title={popup.properties?.title}
          description={popup.properties?.description}
          category={popup.properties?.category}
          day={popup.properties?.day}
          // A posição na sequência DESENHADA, que é o número que está no pino.
          // Mostrar o `order` da IA aqui contradiria o mapa sempre que a
          // Optimization tivesse reordenado o dia.
          order={popup.properties?.sequence ?? popup.properties?.order}
          color={popup.properties?.color}
          nearbyMinutes={DEFAULT_ISOCHRONE_MINUTES}
          nearbyLoading={nearbyLoading}
          // "Ocultar área" só aparece quando a área desenhada é DESTE pino.
          nearbyActive={nearby?.key === `${popup.coordinates?.[0]},${popup.coordinates?.[1]}`}
          onToggleNearby={() => toggleNearby(popup.coordinates)}
        />,
        popup.container
      )}
    </>
  );
}
