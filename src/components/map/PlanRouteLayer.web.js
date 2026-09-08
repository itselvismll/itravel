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
  registerCategoryIcons,
  unregisterCategoryIcons,
  updatePlanRouteData,
} from './planRoute';

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
const FIT_PADDING = 72;
const FIT_MAX_ZOOM = 14;
const FIT_DURATION = 2000;
const SINGLE_POINT_ZOOM = 13;

/**
 * @param {{
 *   map: import('maplibre-gl').Map | null,
 *   points?: Array<any>,
 *   planId?: string | null,
 * }} props
 */
export default function PlanRouteLayer({ map, points, planId }) {
  const data = useMemo(() => buildPlanRouteData(points), [points]);
  const hasPoints = Boolean(points?.length);

  // { properties, container } — o container é o <div> que o MapLibre hospeda e o
  // portal preenche.
  const [popup, setPopup] = useState(null);
  const popupRef = useRef(null);

  const closePopup = useCallback(() => {
    popupRef.current?.remove();
    popupRef.current = null;
    setPopup(null);
  }, []);

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

  // O popup aponta para um ponto do roteiro anterior quando o roteiro troca.
  useEffect(() => {
    closePopup();
  }, [planId, closePopup]);

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
      setPopup({ properties, container });
    });
  }, [map, hasPoints]);

  // Enquadra o roteiro recém-aplicado. Depende do `planId`, e não dos pontos:
  // reenquadrar a cada atualização dos dados roubaria a câmera de quem está
  // navegando pelo globo.
  useEffect(() => {
    if (!map || !planId) return;

    const bounds = planBounds(points);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a troca de roteiro move a câmera
  }, [map, planId]);

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
          order={popup.properties?.order}
          color={popup.properties?.color}
        />,
        popup.container
      )}
    </>
  );
}
