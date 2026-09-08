// Desenho do roteiro ativo no globo: pinos numerados, linha tracejada por dia e
// rótulo com ícone da categoria.
//
// Mesma divisão de countryFill.js: este módulo decide O QUE desenhar e conversa
// com um mapa só por métodos públicos, sem importar `maplibre-gl`. Quem decide
// QUANDO é o PlanRouteLayer.web.js. É o que permite exercitar tudo com um mapa
// falso no teste, sem browser nem WebGL.
//
// Os pontos entram prontos de `getPlanPoints` (src/utils/planGeography.js): já
// achatados, já ordenados por dia e sequência, já com categoria normalizada.
import { findFirstSymbolLayerId } from './countryFill';

export const PLAN_POINT_SOURCE_ID = 'journi-plan-points';
export const PLAN_LINE_SOURCE_ID = 'journi-plan-lines';

export const PLAN_LINE_LAYER_ID = 'journi-plan-line';
export const PLAN_HALO_LAYER_ID = 'journi-plan-halo';
export const PLAN_PIN_LAYER_ID = 'journi-plan-pin';
export const PLAN_NUMBER_LAYER_ID = 'journi-plan-number';
export const PLAN_LABEL_LAYER_ID = 'journi-plan-label';

// Ordem de criação = ordem de empilhamento. Todas entram ancoradas no mesmo
// primeiro symbol layer da style, depois do território pintado: o roteiro fica
// ACIMA do fill de país e ABAIXO dos rótulos da Stadia.
export const PLAN_LAYER_IDS = [
  PLAN_LINE_LAYER_ID,
  PLAN_HALO_LAYER_ID,
  PLAN_PIN_LAYER_ID,
  PLAN_NUMBER_LAYER_ID,
  PLAN_LABEL_LAYER_ID,
];

// Zoom em que o pino deixa de ser só o número e ganha ícone + nome do lugar.
// Nível de cidade: antes disso os nomes de um roteiro urbano ficariam todos
// empilhados no mesmo quarteirão.
export const PLAN_LABEL_ZOOM = 12;

// ── Cores por dia ────────────────────────────────────────────────────────────
// Os quatro primeiros dias usam a paleta da marca, fixa. Do quinto em diante as
// cores são geradas, porque um roteiro de 14+ dias precisa de mais matizes do
// que a marca tem — e repetir a paleta faria o dia 5 se passar pelo dia 1.
export const BASE_DAY_COLORS = ['#FF4D6D', '#00D1C1', '#FF9A00', '#6C2BD9'];

// Matizes das cores fixas acima, para as geradas se afastarem delas.
const BASE_HUES = [350, 175, 36, 265];

// Ângulo áureo: girar o matiz por 137,508° espalha as cores pelo círculo sem
// nunca repetir um ponto já usado — é o mesmo motivo de a natureza usar esse
// ângulo para distribuir folhas sem uma sombrear a outra.
const GOLDEN_ANGLE = 137.508;

// Distância mínima de matiz para duas cores lerem como cores diferentes.
const MIN_HUE_DISTANCE = 18;

const hueDistance = (a, b) => {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
};

const hslToHex = (hue, saturation, lightness) => {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] = (() => {
    if (hue < 60) return [chroma, x, 0];
    if (hue < 120) return [x, chroma, 0];
    if (hue < 180) return [0, chroma, x];
    if (hue < 240) return [0, x, chroma];
    if (hue < 300) return [x, 0, chroma];
    return [chroma, 0, x];
  })();
  const channel = (value) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
};

/**
 * Cor do dia N (1-based).
 *
 * O ângulo áureo sozinho ainda pode cair perto de um dos quatro matizes fixos —
 * e aí o dia 9 viraria "quase o dia 1". Quando isso acontece, o matiz é
 * empurrado para fora da vizinhança. A luminosidade alterna entre os ciclos,
 * então mesmo dois matizes próximos saem em tons distintos.
 *
 * @param {number} day dia do roteiro, começando em 1
 * @returns {string} cor em hexadecimal
 */
export const dayColor = (day) => {
  const index = Math.max(1, Math.floor(Number(day) || 1)) - 1;
  if (index < BASE_DAY_COLORS.length) return BASE_DAY_COLORS[index];

  const step = index - BASE_DAY_COLORS.length + 1;
  let hue = (BASE_HUES[0] + step * GOLDEN_ANGLE) % 360;
  for (let guard = 0; guard < 4; guard += 1) {
    if (!BASE_HUES.some((base) => hueDistance(base, hue) < MIN_HUE_DISTANCE)) break;
    hue = (hue + MIN_HUE_DISTANCE * 2) % 360;
  }

  const cycle = Math.floor(step / 6) % 2;
  return hslToHex(hue, cycle ? 70 : 88, cycle ? 46 : 62);
};

// ── Ícones por categoria ─────────────────────────────────────────────────────
// Mesmo enum da Edge Function e de planGeography.PLACE_CATEGORIES.
export const CATEGORY_EMOJI = {
  restaurante: '🍝',
  atracao: '🏛️',
  compras: '🛍️',
  hotel: '🏨',
  transporte: '🚉',
  natureza: '🌳',
  vida_noturna: '🍸',
  outro: '📍',
};

export const categoryIconId = (category) =>
  `journi-cat-${CATEGORY_EMOJI[category] ? category : 'outro'}`;

// ── Dados ────────────────────────────────────────────────────────────────────

/**
 * Converte os pontos do roteiro nas duas FeatureCollections do mapa.
 *
 * A linha é uma feature POR DIA: é assim que o dia 1 nunca se liga ao dia 2 sem
 * precisar de filtro nenhum na layer. Dia com um ponto só não vira linha —
 * LineString exige dois pares de coordenadas.
 *
 * @param {Array<{day:number, order:number, title?:string, description?:string,
 *   category?:string, latitude:number, longitude:number}>} points
 * @returns {{ points: any, lines: any }}
 */
export const buildPlanRouteData = (points) => {
  const list = points ?? [];
  const pointFeatures = [];
  const byDay = new Map();

  for (const point of list) {
    const day = Number(point?.day) || 1;
    const color = dayColor(day);
    const coordinates = [point.longitude, point.latitude];

    pointFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: {
        day,
        order: Number(point?.order) || 1,
        // O número desenhado é string: `text-field` não formata número, e um
        // valor numérico cru sai com casa decimal em algumas styles.
        orderLabel: String(Number(point?.order) || 1),
        title: point?.title || '',
        description: point?.description || '',
        category: point?.category || 'outro',
        icon: categoryIconId(point?.category),
        color,
      },
    });

    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(coordinates);
  }

  const lineFeatures = [];
  for (const [day, coordinates] of byDay) {
    if (coordinates.length < 2) continue;
    lineFeatures.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { day, color: dayColor(day) },
    });
  }

  return {
    points: { type: 'FeatureCollection', features: pointFeatures },
    lines: { type: 'FeatureCollection', features: lineFeatures },
  };
};

/**
 * Caixa que envolve todos os pontos, no formato que o `fitBounds` espera.
 *
 * @returns {[[number, number], [number, number]] | null} [[oeste, sul], [leste, norte]]
 */
export const planBounds = (points) => {
  const list = points ?? [];
  if (!list.length) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const point of list) {
    west = Math.min(west, point.longitude);
    east = Math.max(east, point.longitude);
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }

  return [[west, south], [east, north]];
};

// ── Layers ───────────────────────────────────────────────────────────────────

const EMPTY = { type: 'FeatureCollection', features: [] };

// Raio do pino por zoom. Pequeno no globo inteiro (onde ele é só um ponto de
// referência), grande o bastante para o número caber quando a câmera desce.
const PIN_RADIUS = ['interpolate', ['linear'], ['zoom'], 2, 7, 6, 10, 12, 13];
const HALO_RADIUS = ['interpolate', ['linear'], ['zoom'], 2, 9.5, 6, 13, 12, 16.5];

/** @param {any} map */
export const isStyleReady = (map) => Boolean(map?.getStyle?.()?.layers?.length);

/**
 * Pilha de fontes que a style já sabe servir.
 *
 * O padrão do spec para `text-font` é `["Open Sans Regular", ...]`, e o endpoint
 * de glyphs da Stadia não tem essa família: o texto do pino sairia vazio, sem
 * erro nenhum no console. Em vez de fixar um nome ("Stadia Semibold") que quebra
 * junto com uma troca de provedor, herdamos a fonte do primeiro symbol layer da
 * própria style — a mesma que os rótulos de cidade usam.
 *
 * `undefined` = nenhuma fonte declarada na style; aí o padrão do MapLibre é o
 * melhor palpite que existe.
 *
 * @param {any} map
 * @returns {string[] | undefined}
 */
export const resolveTextFont = (map) => {
  for (const layer of map?.getStyle?.()?.layers ?? []) {
    const font = layer?.layout?.['text-font'];
    // Só a forma literal serve: `text-font` também aceita expression, e uma
    // expression copiada para cá dependeria de propriedades que nossas features
    // não têm.
    if (Array.isArray(font) && font.every((name) => typeof name === 'string')) return font;
  }
  return undefined;
};

/**
 * Cria as duas sources e as cinco layers do roteiro. Idempotente.
 *
 * @param {any} map
 * @param {{ data?: { points: any, lines: any } }} [options]
 * @returns {boolean} false quando a style ainda está crua
 */
export const attachPlanRouteLayers = (map, { data } = {}) => {
  if (!map || !isStyleReady(map)) return false;

  const points = data?.points ?? EMPTY;
  const lines = data?.lines ?? EMPTY;

  if (map.getSource(PLAN_POINT_SOURCE_ID)) map.getSource(PLAN_POINT_SOURCE_ID).setData(points);
  else map.addSource(PLAN_POINT_SOURCE_ID, { type: 'geojson', data: points });

  if (map.getSource(PLAN_LINE_SOURCE_ID)) map.getSource(PLAN_LINE_SOURCE_ID).setData(lines);
  else map.addSource(PLAN_LINE_SOURCE_ID, { type: 'geojson', data: lines });

  const beforeId = findFirstSymbolLayerId(map.getStyle()?.layers);
  const textFont = resolveTextFont(map);
  const withFont = (layout) => (textFont ? { ...layout, 'text-font': textFont } : layout);

  if (!map.getLayer(PLAN_LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_LINE_LAYER_ID,
        type: 'line',
        source: PLAN_LINE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-opacity': 0.9,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.4, 6, 2.2, 12, 3.2],
          // Tracejado: distingue o trajeto planejado de qualquer via real da
          // style, que é sempre contínua.
          'line-dasharray': [2, 1.6],
        },
      },
      beforeId
    );
  }

  // Anel escuro por baixo do pino. Sobre satélite claro (deserto, neve, nuvem) o
  // disco colorido sozinho perde a borda e o número fica ilegível.
  if (!map.getLayer(PLAN_HALO_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_HALO_LAYER_ID,
        type: 'circle',
        source: PLAN_POINT_SOURCE_ID,
        paint: {
          'circle-radius': HALO_RADIUS,
          'circle-color': '#0D1326',
          'circle-opacity': 0.55,
          'circle-blur': 0.35,
        },
      },
      beforeId
    );
  }

  if (!map.getLayer(PLAN_PIN_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_PIN_LAYER_ID,
        type: 'circle',
        source: PLAN_POINT_SOURCE_ID,
        paint: {
          'circle-radius': PIN_RADIUS,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.9,
        },
      },
      beforeId
    );
  }

  // O número vive colado ao pino: `allow-overlap` + `ignore-placement` porque um
  // pino sem o número dele não é um pino, é uma bolinha. Quem pode sumir na
  // multidão é o rótulo com o nome, na layer seguinte.
  if (!map.getLayer(PLAN_NUMBER_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_NUMBER_LAYER_ID,
        type: 'symbol',
        source: PLAN_POINT_SOURCE_ID,
        layout: withFont({
          'text-field': ['get', 'orderLabel'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 9, 6, 11, 12, 14],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        }),
        paint: {
          'text-color': '#FFFFFF',
          'text-halo-color': 'rgba(13,19,38,0.55)',
          'text-halo-width': 0.6,
        },
      },
      beforeId
    );
  }

  // Zoom progressivo: o nome do lugar e o ícone da categoria só entram no nível
  // de cidade. O emoji vem de `icon-image` e não do texto — os glyphs da Stadia
  // são Noto Sans, sem emoji, e no `text-field` ele sairia como tofu.
  if (!map.getLayer(PLAN_LABEL_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_LABEL_LAYER_ID,
        type: 'symbol',
        source: PLAN_POINT_SOURCE_ID,
        minzoom: PLAN_LABEL_ZOOM,
        layout: withFont({
          'icon-image': ['get', 'icon'],
          'icon-size': 0.5,
          'icon-anchor': 'left',
          'icon-offset': [34, 0],
          'text-field': ['get', 'title'],
          'text-size': 12,
          'text-anchor': 'left',
          'text-offset': [3.1, 0],
          'text-max-width': 12,
          // O rótulo é opcional e o ícone não: quando o nome não cabe, o emoji
          // da categoria continua dizendo o que é aquele ponto.
          'text-optional': true,
        }),
        paint: {
          'text-color': '#F7F7F2',
          'text-halo-color': '#0D1326',
          'text-halo-width': 1.4,
        },
      },
      beforeId
    );
  }

  return true;
};

/**
 * Troca só os dados. É o caminho de "apliquei outro roteiro": a geometria nova
 * vai para o worker, as layers continuam as mesmas.
 *
 * @returns {boolean} false quando as sources ainda não existem
 */
export const updatePlanRouteData = (map, data) => {
  const pointSource = map?.getSource?.(PLAN_POINT_SOURCE_ID);
  const lineSource = map?.getSource?.(PLAN_LINE_SOURCE_ID);
  if (!pointSource || !lineSource) return false;

  pointSource.setData(data?.points ?? EMPTY);
  lineSource.setData(data?.lines ?? EMPTY);
  return true;
};

/**
 * Remove tudo que attachPlanRouteLayers criou.
 *
 * Cada checagem antes de remover existe porque a desmontagem pode vir do próprio
 * map.remove(), quando a style já não existe mais.
 *
 * @param {any} map
 */
export const detachPlanRouteLayers = (map) => {
  if (!map) return;

  for (const layerId of PLAN_LAYER_IDS) {
    if (map.getLayer?.(layerId)) map.removeLayer(layerId);
  }
  for (const sourceId of [PLAN_POINT_SOURCE_ID, PLAN_LINE_SOURCE_ID]) {
    if (map.getSource?.(sourceId)) map.removeSource(sourceId);
  }
};

/**
 * Liga o toque no pino ao callback da tela.
 *
 * O listener é registrado PARA A LAYER, então o MapLibre já faz o hit-test e só
 * chama de volta quando o toque caiu num pino. Escuta as duas layers de círculo:
 * o halo é maior que o disco e é ele que a ponta do dedo encontra na borda.
 *
 * @param {any} map
 * @param {(properties: any, coordinates: [number, number]) => void} onSelect
 * @returns {() => void} função de limpeza
 */
export const bindPlanPointClick = (map, onSelect) => {
  if (!map?.on) return () => {};

  const layers = [PLAN_PIN_LAYER_ID, PLAN_HALO_LAYER_ID];

  const handleClick = (event) => {
    const feature = event?.features?.[0];
    if (!feature) return;
    onSelect(feature.properties, feature.geometry?.coordinates);
  };
  const enter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };
  const leave = () => {
    map.getCanvas().style.cursor = '';
  };

  layers.forEach((layerId) => {
    map.on('click', layerId, handleClick);
    map.on('mouseenter', layerId, enter);
    map.on('mouseleave', layerId, leave);
  });

  return () => {
    layers.forEach((layerId) => {
      map.off('click', layerId, handleClick);
      map.off('mouseenter', layerId, enter);
      map.off('mouseleave', layerId, leave);
    });
  };
};

// Lado do bitmap do ícone, em pixels de dispositivo. 64 com pixelRatio 2 dá um
// emoji de 32 CSS px, nítido em tela retina e pequeno o bastante para os oito
// caberem no atlas sem custo.
const ICON_SIZE = 64;

/**
 * Rasteriza os oito emojis de categoria e registra cada um como imagem do mapa.
 *
 * Só aqui existe dependência de browser (canvas 2D) — por isso a função recebe o
 * mapa e fica fora do caminho de todas as puras acima.
 *
 * @param {any} map
 */
export const registerCategoryIcons = (map) => {
  if (!map?.addImage || typeof document === 'undefined') return;

  for (const [category, emoji] of Object.entries(CATEGORY_EMOJI)) {
    const id = categoryIconId(category);
    if (map.hasImage?.(id)) continue;

    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.font = `${ICON_SIZE * 0.72}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(emoji, ICON_SIZE / 2, ICON_SIZE / 2);

    map.addImage(id, context.getImageData(0, 0, ICON_SIZE, ICON_SIZE), { pixelRatio: 2 });
  }
};

/** Tira do mapa as imagens que registerCategoryIcons criou. */
export const unregisterCategoryIcons = (map) => {
  if (!map?.removeImage) return;
  for (const category of Object.keys(CATEGORY_EMOJI)) {
    const id = categoryIconId(category);
    if (map.hasImage?.(id)) map.removeImage(id);
  }
};
