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
export const PLAN_LINE_FALLBACK_LAYER_ID = 'journi-plan-line-fallback';
export const PLAN_HALO_LAYER_ID = 'journi-plan-halo';
export const PLAN_PIN_LAYER_ID = 'journi-plan-pin';
export const PLAN_NUMBER_LAYER_ID = 'journi-plan-number';
export const PLAN_LABEL_LAYER_ID = 'journi-plan-label';
export const PLAN_CLUSTER_LAYER_ID = 'journi-plan-cluster';
export const PLAN_CLUSTER_COUNT_LAYER_ID = 'journi-plan-cluster-count';

// Ordem de criação = ordem de empilhamento. Todas entram ancoradas no mesmo
// primeiro symbol layer da style, depois do território pintado: o roteiro fica
// ACIMA do fill de país e ABAIXO dos rótulos da Stadia.
export const PLAN_LAYER_IDS = [
  PLAN_LINE_LAYER_ID,
  PLAN_LINE_FALLBACK_LAYER_ID,
  PLAN_HALO_LAYER_ID,
  PLAN_PIN_LAYER_ID,
  PLAN_NUMBER_LAYER_ID,
  PLAN_LABEL_LAYER_ID,
  PLAN_CLUSTER_LAYER_ID,
  PLAN_CLUSTER_COUNT_LAYER_ID,
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
//
// ÍCONES VETORIAIS, NÃO EMOJI. O emoji é desenhado pela fonte do SISTEMA: o
// mesmo 🏛️ sai colorido e arredondado no iPhone, chapado no Android e de outra
// família ainda no Windows — três aparências para o mesmo dado, nenhuma delas
// escolhida por nós. Num mapa escuro e com satélite por baixo isso é pior do
// que parece: o emoji carrega o próprio fundo claro e a própria paleta, que
// briga com a cor do dia no pino ao lado.
//
// Os nomes são do Ionicons (@expo/vector-icons), na variante outline — a mesma
// família dos outros controles do app.
export const CATEGORY_ICON = {
  restaurante: 'restaurant-outline',
  atracao: 'business-outline',
  compras: 'bag-handle-outline',
  hotel: 'bed-outline',
  transporte: 'train-outline',
  natureza: 'leaf-outline',
  vida_noturna: 'wine-outline',
  outro: 'location-outline',
};

/** Cor dos ícones de categoria desenhados no mapa: o creme da marca, que é o
 * mesmo tom do rótulo com o nome do lugar logo ao lado. */
export const CATEGORY_ICON_COLOR = '#F7F7F2';

export const categoryIconId = (category) =>
  `journi-cat-${CATEGORY_ICON[category] ? category : 'outro'}`;

// ── Dados ────────────────────────────────────────────────────────────────────

/**
 * Converte os pontos do roteiro nas duas FeatureCollections do mapa.
 *
 * A linha é uma feature POR DIA: é assim que o dia 1 nunca se liga ao dia 2 sem
 * precisar de filtro nenhum na layer. Dia com um ponto só não vira linha —
 * LineString exige dois pares de coordenadas.
 *
 * O segundo argumento é o resultado do `buildPlanRoutes` (mapboxRouting.js) e é
 * OPCIONAL em todos os níveis. Sem ele — porque as APIs ainda não responderam,
 * falharam ou nem foram chamadas — o desenho é o de sempre: os pontos na ordem
 * da IA, ligados por retas. Com ele, o dia é redesenhado na ordem otimizada e a
 * linha passa a ser o traçado real das ruas.
 *
 * O número do pino segue a POSIÇÃO na sequência desenhada, não o `order` que a
 * IA mandou: depois de otimizar, um pino "3" no meio do caminho entre o 1 e o 2
 * faria a linha parecer errada. O `order` original continua nas properties, para
 * quem precisar dele.
 *
 * O terceiro argumento é o país de cada parada, na ordem dos pontos
 * (planBadges.planPointCountries). Ele vira `countryCode` nas properties e sai
 * daqui direto para o cabeçalho da folha, que é o único lugar onde a bandeira
 * aparece desde que ela saiu de cima do pino. Também é opcional: sem geometria
 * carregada a parada simplesmente não tem bandeira.
 *
 * @param {Array<{day:number, order:number, title?:string, description?:string,
 *   category?:string, latitude:number, longitude:number}>} points
 * @param {Map<number, { points?: Array<any>, coordinates?: Array<any>|null }>} [routes]
 * @param {{ countryCodes?: Array<string | null> }} [options]
 * @returns {{ points: any, lines: any }}
 */
export const buildPlanRouteData = (points, routes, { countryCodes } = {}) => {
  const list = points ?? [];
  const byDay = new Map();

  // Índice por coordenada, e não pela identidade do objeto: a Optimization do
  // Mapbox devolve os pontos do dia reordenados, e nada garante que sejam os
  // MESMOS objetos que entraram.
  const countryByCoordinate = new Map();
  if (Array.isArray(countryCodes)) {
    list.forEach((point, index) => {
      const code = countryCodes[index];
      if (code) countryByCoordinate.set(`${point?.longitude},${point?.latitude}`, code);
    });
  }

  // Agrupa preservando a ordem de entrada (getPlanPoints já ordena por dia e
  // sequência), para o dia sem rota otimizada continuar exatamente como estava.
  for (const point of list) {
    const day = Number(point?.day) || 1;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(point);
  }

  const pointFeatures = [];
  const lineFeatures = [];

  for (const [day, aiOrdered] of byDay) {
    const route = routes?.get?.(day);
    const color = dayColor(day);

    // A ordem otimizada só é aceita se cobrir o mesmo número de pontos do dia:
    // uma resposta truncada sumiria com paradas do roteiro.
    const ordered =
      route?.points?.length === aiOrdered.length ? route.points : aiOrdered;

    const straight = [];
    ordered.forEach((point, index) => {
      const coordinates = [point.longitude, point.latitude];
      straight.push(coordinates);

      pointFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: {
          day,
          order: Number(point?.order) || index + 1,
          sequence: index + 1,
          // O número desenhado é string: `text-field` não formata número, e um
          // valor numérico cru sai com casa decimal em algumas styles.
          orderLabel: String(index + 1),
          title: point?.title || '',
          description: point?.description || '',
          category: point?.category || 'outro',
          icon: categoryIconId(point?.category),
          countryCode: countryByCoordinate.get(`${point?.longitude},${point?.latitude}`) || '',
          latitude: point.latitude,
          longitude: point.longitude,
          color,
        },
      });
    });

    // Rota real quando o Directions respondeu; reta entre os pontos quando não.
    // `routed` é o que separa as duas layers de linha — contínua para o traçado
    // verdadeiro, tracejada para o palpite.
    const routed = Array.isArray(route?.coordinates) && route.coordinates.length >= 2;
    const geometry = routed ? route.coordinates : straight;
    if (geometry.length < 2) continue;

    lineFeatures.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: geometry },
      properties: { day, color, routed },
    });
  }

  return {
    points: { type: 'FeatureCollection', features: pointFeatures },
    lines: { type: 'FeatureCollection', features: lineFeatures },
  };
};

/** Dias presentes no roteiro, em ordem — alimenta o seletor de dias. */
export const planDays = (points) =>
  [...new Set((points ?? []).map((point) => Number(point?.day) || 1))].sort((a, b) => a - b);

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

// O badge de grupo é maior que o pino que ele substitui — precisa caber "+3" e
// precisa ler como "aqui tem mais de uma coisa", não como uma parada gorda.
const CLUSTER_RADIUS = ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13, 12, 17];

// Uma parada solta e um grupo saem da MESMA source: o que separa as duas metades
// é a marca que planClusters.js carimba na feature. Sem estes filtros, o pino
// numerado apareceria embaixo do badge do grupo.
const SINGLE_FILTER = ['!=', ['get', 'cluster'], true];
const CLUSTER_FILTER = ['==', ['get', 'cluster'], true];

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

  // Duas layers para a mesma source, separadas pelo `routed` da feature.
  //
  // Não é enfeite: `line-dasharray` não aceita expression data-driven, então uma
  // layer só teria de escolher um traço para os dois casos — e eles NÃO são o
  // mesmo caso. A linha contínua é o caminho real que o Directions devolveu; a
  // tracejada é uma reta entre os pontos, que é um palpite. Desenhar o palpite
  // com a mesma confiança do traçado verdadeiro seria mentir sobre o trajeto,
  // ainda mais num mapa onde a reta cruza rio, prédio e via sem saída.
  if (!map.getLayer(PLAN_LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_LINE_LAYER_ID,
        type: 'line',
        source: PLAN_LINE_SOURCE_ID,
        filter: ['==', ['get', 'routed'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-opacity': 0.9,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.4, 6, 2.2, 12, 3.2],
        },
      },
      beforeId
    );
  }

  if (!map.getLayer(PLAN_LINE_FALLBACK_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_LINE_FALLBACK_LAYER_ID,
        type: 'line',
        source: PLAN_LINE_SOURCE_ID,
        filter: ['!=', ['get', 'routed'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          // Um pouco mais apagada que a rota real, além de tracejada: são dois
          // sinais dizendo "isto é aproximado".
          'line-opacity': 0.75,
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
        filter: SINGLE_FILTER,
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
        filter: SINGLE_FILTER,
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
        filter: SINGLE_FILTER,
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
        filter: SINGLE_FILTER,
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

  // ── Grupos ────────────────────────────────────────────────────────────────
  // Duas ou mais paradas que se encostam na tela viram UM badge com a contagem.
  // A cor vem pronta da feature: a do dia, quando o grupo é todo do mesmo dia, e
  // o vidro escuro quando ele mistura dias (ver planClusters.js).
  if (!map.getLayer(PLAN_CLUSTER_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_CLUSTER_LAYER_ID,
        type: 'circle',
        source: PLAN_POINT_SOURCE_ID,
        filter: CLUSTER_FILTER,
        paint: {
          'circle-radius': CLUSTER_RADIUS,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.95,
          // Anel mais grosso que o do pino: é o que diz "isto abre", e é o que
          // segura a leitura do badge escuro sobre satélite escuro.
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.95,
        },
      },
      beforeId
    );
  }

  if (!map.getLayer(PLAN_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer(
      {
        id: PLAN_CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: PLAN_POINT_SOURCE_ID,
        filter: CLUSTER_FILTER,
        layout: withFont({
          'text-field': ['get', 'countLabel'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 12, 12, 14],
          // Mesma razão do número da parada: um badge sem a contagem não é um
          // badge, é uma bolinha.
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

  return true;
};

// O `routed` continua mandando em qual das duas layers de linha cada feature
// aparece; o dia entra POR CIMA disso. Guardar o filtro base aqui é o que
// permite compor os dois sem uma layer apagar a regra da outra.
const BASE_FILTERS = {
  [PLAN_LINE_LAYER_ID]: ['==', ['get', 'routed'], true],
  [PLAN_LINE_FALLBACK_LAYER_ID]: ['!=', ['get', 'routed'], true],
};

/** As layers cujo recorte por dia é feito por FILTRO. Ver setPlanDayFilter. */
const DAY_FILTERED_LAYER_IDS = [PLAN_LINE_LAYER_ID, PLAN_LINE_FALLBACK_LAYER_ID];

/**
 * Mostra só um dia do roteiro, ou todos — nas LINHAS.
 *
 * As paradas ficaram de fora desta função, e a razão é o agrupamento. Um badge
 * "+3" pode juntar paradas de dias diferentes, e uma feature de grupo não tem
 * um `day` só para o filtro comparar: o dia 2 escondido levaria junto o grupo
 * inteiro, sumindo com paradas do dia que está em foco.
 *
 * Então o recorte das paradas acontece ANTES, nos dados: quem chama filtra a
 * lista por dia, agrupa o que sobrou (planClusters.js) e manda o resultado pela
 * source. Custa uma `setData` de algumas dezenas de pontos — o mesmo trabalho
 * que o filtro de layer economizava, feito num lugar onde ele está certo.
 *
 * As linhas continuam no filtro: elas são uma feature por dia, sem agrupamento
 * nenhum, e a geometria delas é a parte pesada que não vale reenviar.
 *
 * @param {any} map
 * @param {number | null} day dia a exibir; null/undefined mostra o roteiro todo
 * @returns {boolean} false quando as layers ainda não existem
 */
export const setPlanDayFilter = (map, day) => {
  if (!map?.getLayer?.(PLAN_PIN_LAYER_ID)) return false;

  const dayFilter = Number.isFinite(day) ? ['==', ['get', 'day'], Number(day)] : null;

  for (const layerId of DAY_FILTERED_LAYER_IDS) {
    if (!map.getLayer?.(layerId)) continue;

    const base = BASE_FILTERS[layerId] || null;
    let filter = null;
    if (base && dayFilter) filter = ['all', base, dayFilter];
    else filter = dayFilter || base;

    // `undefined` (e não null) é o que o MapLibre entende por "sem filtro".
    map.setFilter(layerId, filter || undefined);
  }

  return true;
};

/**
 * As paradas de um dia, ou todas.
 *
 * O par da função acima: é este recorte que vai para a source depois de passar
 * pelo agrupamento. Fica aqui, e não na tela, porque a regra é a mesma nas três
 * plataformas — e porque é puro, então o teste a exercita sem mapa nenhum.
 *
 * @param {{ features?: any[] }} pointData
 * @param {number | null} day
 * @returns {{ type: 'FeatureCollection', features: any[] }}
 */
export const filterPointsByDay = (pointData, day) => {
  const features = pointData?.features ?? [];
  if (!Number.isFinite(day)) return { type: 'FeatureCollection', features: [...features] };

  return {
    type: 'FeatureCollection',
    features: features.filter((feature) => Number(feature?.properties?.day) === Number(day)),
  };
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

/**
 * Liga o toque no badge de grupo ao callback da tela.
 *
 * Irmão de bindPlanPointClick, e separado dele de propósito: o toque numa parada
 * abre "o que tem por perto", o toque num grupo o abre. Um handler só que
 * decidisse pelo `properties.cluster` misturaria dois gestos com respostas
 * diferentes no mesmo lugar.
 *
 * @param {any} map
 * @param {(properties: any, coordinates: [number, number]) => void} onSelect
 * @returns {() => void} função de limpeza
 */
export const bindPlanClusterClick = (map, onSelect) => {
  if (!map?.on) return () => {};

  const layers = [PLAN_CLUSTER_LAYER_ID, PLAN_CLUSTER_COUNT_LAYER_ID];

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

// O desenho dos ícones de categoria como imagens do mapa vive em
// categoryIconImages.js: ele precisa de canvas e da fonte de ícones carregada,
// e este módulo continua sendo exercitado no teste sem browser nenhum.
