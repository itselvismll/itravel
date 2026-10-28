// Prende o ciclo de vida das layers do roteiro ao ciclo de vida do React.
//
// Mesma divisão de CountryFillLayer: planRoute.js sabe O QUE desenhar e como
// conversar com um mapa; aqui é só QUANDO. Desde o redesenho, este arquivo é
// SÓ renderização — ele não decide mais nada.
//
// O QUE SAIU DAQUI, E POR QUÊ. Antes este componente abria um popup, buscava a
// isócrona, guardava qual pino tinha a área no ar e desenhava o cartão da parada.
// Tudo isso era regra de negócio morando no único arquivo do projeto que só
// existe na web — e o destino do Journi é o app nativo. Agora:
//
//   • o agrupamento de paradas próximas é puro (planClusters.js), e este arquivo
//     só fornece a projeção de tela que ele pede;
//   • a busca da área e dos lugares é um hook (useNearbyPlaces), que roda no lado
//     React Native nas duas plataformas;
//   • o cartão da parada é uma folha React Native (NearbyPlacesSheet), fora do
//     mapa.
//
// O que restou é o contrato: o mapa AVISA que tocaram numa parada
// (`onSelectStop`) ou num grupo (`onSelectCluster`), e RECEBE a área pronta para
// desenhar (`nearbyArea`). É o mesmo contrato que atravessa a ponte do DOM
// Component no iOS/Android — lá as chamadas viram mensagens, e nada mais muda.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  attachPlanRouteLayers,
  bindPlanClusterClick,
  bindPlanPointClick,
  buildPlanRouteData,
  detachPlanRouteLayers,
  filterPointsByDay,
  isStyleReady,
  planBounds,
  PLAN_CLUSTER_LAYER_ID,
  PLAN_HALO_LAYER_ID,
  PLAN_PIN_LAYER_ID,
  PLAN_POINT_SOURCE_ID,
  setPlanDayFilter,
  updatePlanRouteData,
} from './planRoute';
import { registerCategoryIcons, unregisterCategoryIcons } from './categoryIconImages';
import { clusterMembers, clusterPlanFeatures } from './planClusters';
import usePlanRoutes from './usePlanRoutes';
import {
  NEARBY_AREA_FEATURE_ENABLED,
  attachIsochroneLayers,
  attachNearbyFocusLayers,
  detachIsochroneLayers,
  detachNearbyFocusLayers,
  updateIsochroneData,
  updateNearbyFocusData,
} from './isochroneLayer';
import { distanceMeters, geometryBounds } from '../../utils/geoMeasure';

// Enquadramento do roteiro. O padding evita que um ponto encoste na borda (e
// fique atrás da barra de IA no topo); o maxZoom impede que um roteiro de um
// bairro só mergulhe até o nível da calçada.
const FIT_PADDING = 72;
const FIT_MAX_ZOOM = 14;
const FIT_DURATION = 2000;
const SINGLE_POINT_ZOOM = 13;

// Até onde o toque num grupo aproxima, e a partir de onde ele desiste de
// aproximar. Passado isso, mais zoom não separa mais nada — duas paradas na
// mesma esquina continuariam no mesmo pixel — e a resposta certa é a lista.
const CLUSTER_ZOOM_MAX = 16.5;

// Distância entre as paradas do grupo abaixo da qual o zoom não resolve. Dez
// metros é a largura de uma calçada: dois pontos assim tão próximos são, para
// quem está andando, o mesmo lugar.
const CLUSTER_SEPARABLE_METERS = 10;

// Enquadramento da área a pé quando a folha abre.
//
// A folha ocupa a parte de baixo da tela, e sem isto a área — que é desenhada em
// volta da parada, quase sempre no meio do mapa — nasce atrás dela. O padding de
// baixo é a altura real da folha, medida na tela e recebida por prop: é o que
// garante que o círculo inteiro caiba na faixa de mapa que sobra por cima.
const AREA_FIT_PADDING_TOP = 96;
const AREA_FIT_PADDING_SIDE = 32;
const AREA_FIT_MARGIN = 20;
const AREA_FIT_MAX_ZOOM = 15.5;
const AREA_FIT_DURATION = 700;

/**
 * Uma parada está atrás do globo?
 *
 * `map.project` devolve um pixel para o hemisfério de trás também — e sem esta
 * checagem uma parada em Tóquio agruparia com uma em Lisboa quando as duas caem
 * no mesmo ponto da silhueta. É a mesma checagem que CountryBadgeMarkers faz
 * para os badges de país, pelo mesmo motivo.
 */
const isBehindGlobe = (map, coordinates) => {
  const transform = /** @type {any} */ (map).transform;
  const lngLat = { lng: coordinates?.[0], lat: coordinates?.[1] };

  if (typeof transform?.isLocationOccluded === 'function') {
    return transform.isLocationOccluded(lngLat);
  }

  // Sem o método interno, o ângulo de grande círculo até o centro: mais de 90°
  // é hemisfério de trás.
  const center = map.getCenter();
  const toRad = Math.PI / 180;
  const cosAngle =
    Math.sin(lngLat.lat * toRad) * Math.sin(center.lat * toRad)
    + Math.cos(lngLat.lat * toRad)
      * Math.cos(center.lat * toRad)
      * Math.cos((lngLat.lng - center.lng) * toRad);
  return cosAngle < 0;
};

/**
 * @param {{
 *   map: import('maplibre-gl').Map | null,
 *   points?: Array<any>,
 *   planId?: string | null,
 *   selectedDay?: number | null,
 *   countryCodes?: Array<string | null>,
 *   nearbyArea?: any,
 *   focusPlace?: any,
 *   bottomInset?: number,
 *   onSelectStop?: (properties: any) => void,
 *   onSelectCluster?: (members: Array<any>) => void,
 *   onDismiss?: () => void,
 * }} props
 */
export default function PlanRouteLayer({
  map,
  points,
  planId,
  selectedDay = null,
  countryCodes = undefined,
  nearbyArea = null,
  focusPlace = null,
  bottomInset = 0,
  onSelectStop,
  onSelectCluster,
  onDismiss,
}) {
  // Ordem otimizada e traçado real, quando o Mapbox responde. Chega em partes,
  // um dia por vez — e pode nunca chegar, que é o caso de fallback.
  const { routes } = usePlanRoutes(points, planId);

  // `routes` entra na dependência porque cada dia que volta redesenha aquele
  // dia: os pinos ganham a numeração da sequência otimizada e a reta tracejada
  // vira o caminho de rua.
  const data = useMemo(
    () => buildPlanRouteData(points, routes, { countryCodes }),
    [points, routes, countryCodes]
  );
  const hasPoints = Boolean(points?.length);

  // Callbacks por ref: trocar a função no pai não pode desfazer e refazer os
  // listeners do mapa a cada render.
  const onSelectStopRef = useRef(onSelectStop);
  onSelectStopRef.current = onSelectStop;
  const onSelectClusterRef = useRef(onSelectCluster);
  onSelectClusterRef.current = onSelectCluster;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // O dia escolhido e os dados são lidos dentro de handlers do MAPA, que rodam
  // em resposta a um evento e não a um render. Refs são o que dá a eles o valor
  // ATUAL sem colocar essas dependências no efeito de montagem — que remontaria
  // todas as layers a cada troca de aba.
  const selectedDayRef = useRef(selectedDay);
  selectedDayRef.current = selectedDay;
  const dataRef = useRef(data);
  dataRef.current = data;

  /**
   * Recalcula os grupos e manda o resultado para a source.
   *
   * É a única coisa que roda a cada movimento da câmera, e é barata: dezenas de
   * paradas, aritmética de pixels, uma `setData`. O filtro de dia acontece ANTES
   * do agrupamento — é o que garante que um badge "+3" nunca conte parada de um
   * dia que está escondido.
   */
  const renderClusters = useCallback(() => {
    if (!map || !dataRef.current) return;

    const visible = filterPointsByDay(dataRef.current.points, selectedDayRef.current);
    const clustered = clusterPlanFeatures(visible, (coordinates) => {
      if (isBehindGlobe(map, coordinates)) return null;
      return map.project(coordinates);
    });

    updatePlanRouteData(map, { points: clustered, lines: dataRef.current.lines });
  }, [map]);

  // Sem roteiro ativo as layers nem são criadas: o globo fica exatamente como
  // era antes desta feature. É por isso que `hasPoints` está na dependência —
  // remover o roteiro do mapa desmonta tudo em vez de deixar sources vazias.
  useEffect(() => {
    if (!map || !hasPoints) return undefined;

    const attach = () => {
      // As imagens de categoria vivem na style, não no mapa: uma troca de style
      // as leva junto, então elas são registradas no mesmo gatilho das layers.
      registerCategoryIcons(map);
      attachPlanRouteLayers(map, { data: dataRef.current });
      // Layer recém-criada nasce sem filtro. Sem esta linha, uma troca de style
      // com um dia selecionado traria as linhas do roteiro inteiro de volta.
      setPlanDayFilter(map, selectedDayRef.current);
      renderClusters();
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
  }, [map, hasPoints, renderClusters]);

  // Aplicar OUTRO roteiro, ou receber a rota otimizada de mais um dia, troca só
  // os dados: as layers continuam as mesmas e nada é recriado. Passa pelo
  // agrupamento porque é ele que decide o que a source recebe.
  useEffect(() => {
    if (!map || !hasPoints) return;
    // A source já existe no caminho normal; o attach aqui cobre o roteiro que
    // chegou antes de a style ficar pronta. Quem publica os dados é sempre o
    // agrupamento — mandar a coleção crua antes dele só desenharia, por um
    // instante, os pinos sobrepostos que esta feature existe para evitar.
    if (!map.getSource?.(PLAN_POINT_SOURCE_ID)) attachPlanRouteLayers(map, { data });
    renderClusters();
  }, [map, data, hasPoints, renderClusters]);

  // Troca de dia: filtro nas linhas, dados novos nas paradas. Ver o comentário
  // de setPlanDayFilter — um grupo pode misturar dias, e por isso o recorte das
  // paradas não pode ser um filtro de layer.
  useEffect(() => {
    if (!map || !hasPoints) return;
    setPlanDayFilter(map, selectedDay);
    renderClusters();
  }, [map, hasPoints, selectedDay, data, renderClusters]);

  // Agrupar é uma conta em pixels: mover a câmera muda a resposta.
  //
  // O gatilho é 'moveend' e não 'move': o que muda o agrupamento é a DISTÂNCIA
  // entre as paradas na tela, e ela só muda de verdade com zoom e rotação —
  // arrastar o mapa translada todo mundo junto. Recalcular a cada quadro do
  // arrasto pagaria uma `setData` por quadro para chegar ao mesmo resultado.
  useEffect(() => {
    if (!map || !hasPoints) return undefined;

    map.on('moveend', renderClusters);
    return () => {
      map.off('moveend', renderClusters);
    };
  }, [map, hasPoints, renderClusters]);

  // Layers da área. Efeito separado do roteiro porque o ciclo de vida é outro:
  // elas só existem enquanto há área no ar, e escondê-la não mexe no roteiro.
  useEffect(() => {
    if (!NEARBY_AREA_FEATURE_ENABLED) return undefined;
    if (!map || !nearbyArea) return undefined;

    const attach = () => attachIsochroneLayers(map, { feature: nearbyArea });

    // Mesma escada do roteiro: style crua monta no 'style.load', style pronta
    // monta agora.
    if (!isStyleReady(map)) map.on('style.load', attach);
    else attach();

    return () => {
      map.off('style.load', attach);
      detachIsochroneLayers(map);
    };
  }, [map, nearbyArea]);

  // Área nova no mesmo ciclo: troca só os dados, sem recriar as layers.
  useEffect(() => {
    if (!NEARBY_AREA_FEATURE_ENABLED) return;
    if (!map || !nearbyArea) return;
    updateIsochroneData(map, nearbyArea);
  }, [map, nearbyArea]);

  // Enquadra a área assim que ela chega, respeitando o espaço que a folha ocupa.
  //
  // A ref guarda QUAL área já foi enquadrada: a altura da folha muda sozinha
  // (a lista chega depois da área e o cartão cresce), e sem isso cada mudança de
  // altura mexeria na câmera de novo, no meio da leitura.
  const framedAreaRef = useRef(null);
  const bottomInsetRef = useRef(bottomInset);
  bottomInsetRef.current = bottomInset;

  useEffect(() => {
    // Sem área desenhada não há o que enquadrar: a câmera fica onde o usuário a
    // deixou, que era o comportamento antes de a folha existir.
    if (!NEARBY_AREA_FEATURE_ENABLED) return;
    if (!map || !nearbyArea) {
      framedAreaRef.current = null;
      return;
    }
    if (framedAreaRef.current === nearbyArea) return;
    framedAreaRef.current = nearbyArea;

    const bounds = geometryBounds(nearbyArea.geometry);
    if (!bounds) return;

    const [west, south, east, north] = bounds;
    map.fitBounds([[west, south], [east, north]], {
      padding: {
        top: AREA_FIT_PADDING_TOP,
        bottom: bottomInsetRef.current + AREA_FIT_MARGIN,
        left: AREA_FIT_PADDING_SIDE,
        right: AREA_FIT_PADDING_SIDE,
      },
      maxZoom: AREA_FIT_MAX_ZOOM,
      duration: AREA_FIT_DURATION,
    });
  }, [map, nearbyArea]);

  // Layers do lugar tocado na lista. Ciclo de vida próprio, como o da área: elas
  // só existem enquanto há um lugar em foco.
  useEffect(() => {
    if (!map || !focusPlace) return undefined;

    const attach = () => attachNearbyFocusLayers(map, { place: focusPlace });

    if (!isStyleReady(map)) map.on('style.load', attach);
    else attach();

    return () => {
      map.off('style.load', attach);
      detachNearbyFocusLayers(map);
    };
  }, [map, focusPlace]);

  // Lugar novo no mesmo ciclo: troca só os dados, e leva a câmera até ele.
  //
  // O deslocamento vertical sobe o ponto para o meio da faixa de mapa que a
  // folha deixa livre — centralizar na tela inteira o colocaria atrás da lista,
  // que é exatamente o que o toque na lista quer mostrar.
  useEffect(() => {
    if (!map || !focusPlace) return;

    updateNearbyFocusData(map, focusPlace);
    map.easeTo({
      center: [focusPlace.longitude, focusPlace.latitude],
      offset: [0, -bottomInsetRef.current / 2],
      duration: 600,
    });
  }, [map, focusPlace]);

  // Toque em qualquer outro lugar do mapa fecha a folha — o mesmo gesto de
  // sempre para dispensar um cartão. O listener é do MAPA e recebe também os
  // toques que caíram num pino ou num badge; nesse caso o handler específico já
  // tratou, e fechar aqui desfaria no mesmo instante o que foi pedido. Daí o
  // hit-test explícito.
  useEffect(() => {
    if (!map || !hasPoints) return undefined;

    const handleMapClick = (event) => {
      const layers = [PLAN_PIN_LAYER_ID, PLAN_HALO_LAYER_ID, PLAN_CLUSTER_LAYER_ID]
        .filter((id) => map.getLayer?.(id));
      const hits = layers.length ? map.queryRenderedFeatures?.(event.point, { layers }) : null;
      if (hits?.length) return;
      onDismissRef.current?.();
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, hasPoints]);

  // Toque na parada. Efeito próprio porque o listener é da LAYER: registrar
  // antes dela existir não pega nada.
  useEffect(() => {
    if (!map || !hasPoints) return undefined;

    return bindPlanPointClick(map, (properties) => {
      if (!properties) return;
      onSelectStopRef.current?.(properties);
    });
  }, [map, hasPoints]);

  // Toque no badge de grupo.
  //
  // Primeiro tenta o gesto natural: aproximar até as paradas se separarem, que é
  // o que alguém espera de um "+3" num mapa. Quando o zoom não resolve — paradas
  // a menos de dez metros uma da outra, ou câmera já no fundo do poço — a
  // resposta passa a ser a lista. As duas metades existem porque as duas
  // situações existem: seis capitais dos Bálcãs se separam com zoom, dois
  // restaurantes no mesmo quarteirão não.
  useEffect(() => {
    if (!map || !hasPoints) return undefined;

    return bindPlanClusterClick(map, (properties, coordinates) => {
      const members = clusterMembers(properties);
      if (!members.length) return;

      const bounds = planBounds(members);
      const spread = bounds
        ? distanceMeters([bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]])
        : 0;
      const canSeparate =
        Number.isFinite(spread)
        && spread > CLUSTER_SEPARABLE_METERS
        && map.getZoom() < CLUSTER_ZOOM_MAX;

      if (!canSeparate) {
        onSelectClusterRef.current?.(members);
        return;
      }

      const [[west, south], [east, north]] = bounds;
      if (west === east && south === north) {
        map.flyTo({ center: coordinates, zoom: CLUSTER_ZOOM_MAX, duration: 600 });
        return;
      }

      map.fitBounds(bounds, { padding: 120, maxZoom: CLUSTER_ZOOM_MAX, duration: 600 });
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

  // Componente sem saída visual própria: tudo que ele produz está no mapa.
  return null;
}
