// Desenho da área "O que tem por perto" no globo: o polígono da isócrona a pé
// em volta do ponto tocado.
//
// Mesma divisão de planRoute.js e countryFill.js: este módulo decide O QUE
// desenhar e conversa com um mapa só por métodos públicos, sem importar
// `maplibre-gl`. Quem decide QUANDO é o PlanRouteLayer.web.js. É o que permite
// exercitar tudo com um mapa falso no teste, sem browser nem WebGL.
import { findFirstSymbolLayerId } from './countryFill';
import { PLAN_LINE_LAYER_ID, PLAN_LINE_FALLBACK_LAYER_ID } from './planRoute';

export const ISOCHRONE_SOURCE_ID = 'journi-isochrone';

export const ISOCHRONE_FILL_LAYER_ID = 'journi-isochrone-fill';
export const ISOCHRONE_OUTLINE_LAYER_ID = 'journi-isochrone-outline';

// Ordem de criação = ordem de empilhamento.
export const ISOCHRONE_LAYER_IDS = [ISOCHRONE_FILL_LAYER_ID, ISOCHRONE_OUTLINE_LAYER_ID];

// Teal da marca (COLORS.teal). Escolhido por ser a única cor da paleta que NÃO
// está no início do ciclo de dias: o dia 1 é vermelho, o 3 é laranja e o 4 é
// roxo, então um preenchimento nesses tons se confundiria com a rota por cima
// dele. O teal é a cor do dia 2 — e é aí que a opacidade baixa e a ausência de
// traço grosso separam os dois: área é mancha, rota é linha.
export const ISOCHRONE_COLOR = '#00D1C1';

// Baixa de propósito. A área é CONTEXTO — ela responde "até onde dá para ir" e
// tem de deixar ver o satélite, os pinos e a linha do roteiro por baixo. Uma
// mancha opaca esconderia justamente o que o usuário quer olhar dentro dela.
export const ISOCHRONE_FILL_OPACITY = 0.25;

const EMPTY = { type: 'FeatureCollection', features: [] };

/** @param {any} map */
const styleReady = (map) => Boolean(map?.getStyle?.()?.layers?.length);

/**
 * Empacota a Feature do serviço na FeatureCollection que a source espera.
 * `null` vira coleção vazia, que é como se apaga a área sem remover a layer.
 *
 * @param {any} feature Feature de fetchIsochrone, ou null
 */
export const buildIsochroneData = (feature) =>
  (feature ? { type: 'FeatureCollection', features: [feature] } : EMPTY);

/**
 * Onde a área entra na pilha.
 *
 * ABAIXO da linha do roteiro, não acima: o traçado do dia é a informação
 * principal da tela, e uma mancha por cima dele — mesmo a 0.25 — lavaria a cor
 * que identifica o dia. Quando as layers do roteiro ainda não existem (área
 * pedida antes do roteiro montar), a âncora volta a ser o primeiro symbol layer
 * da style, que é a mesma do roteiro: a área fica acima do território pintado e
 * abaixo dos rótulos da Stadia.
 *
 * @param {any} map
 * @returns {string | undefined}
 */
export const isochroneBeforeId = (map) => {
  for (const layerId of [PLAN_LINE_LAYER_ID, PLAN_LINE_FALLBACK_LAYER_ID]) {
    if (map?.getLayer?.(layerId)) return layerId;
  }
  return findFirstSymbolLayerId(map?.getStyle?.()?.layers);
};

/**
 * Cria a source e as duas layers da área. Idempotente.
 *
 * @param {any} map
 * @param {{ feature?: any }} [options]
 * @returns {boolean} false quando a style ainda está crua
 */
export const attachIsochroneLayers = (map, { feature } = {}) => {
  if (!map || !styleReady(map)) return false;

  const data = buildIsochroneData(feature);

  if (map.getSource(ISOCHRONE_SOURCE_ID)) map.getSource(ISOCHRONE_SOURCE_ID).setData(data);
  else map.addSource(ISOCHRONE_SOURCE_ID, { type: 'geojson', data });

  const beforeId = isochroneBeforeId(map);

  if (!map.getLayer(ISOCHRONE_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: ISOCHRONE_FILL_LAYER_ID,
        type: 'fill',
        source: ISOCHRONE_SOURCE_ID,
        paint: {
          'fill-color': ISOCHRONE_COLOR,
          'fill-opacity': ISOCHRONE_FILL_OPACITY,
        },
      },
      beforeId
    );
  }

  // A borda existe porque o preenchimento a 0.25 quase some sobre satélite
  // claro: sem o contorno, o limite da área — que é a resposta à pergunta —
  // ficaria ilegível justamente onde importa.
  if (!map.getLayer(ISOCHRONE_OUTLINE_LAYER_ID)) {
    map.addLayer(
      {
        id: ISOCHRONE_OUTLINE_LAYER_ID,
        type: 'line',
        source: ISOCHRONE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ISOCHRONE_COLOR,
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 14, 2 ],
        },
      },
      beforeId
    );
  }

  return true;
};

/**
 * Troca só os dados da área — inclusive para apagá-la, passando `null`.
 *
 * Apagar pelos dados e não removendo as layers é de propósito: tocar num pino,
 * depois noutro, é o uso normal da feature, e recriar duas layers a cada troca
 * piscaria a tela.
 *
 * @param {any} map
 * @param {any} feature Feature de fetchIsochrone, ou null para limpar
 * @returns {boolean} false quando a source ainda não existe
 */
export const updateIsochroneData = (map, feature) => {
  const source = map?.getSource?.(ISOCHRONE_SOURCE_ID);
  if (!source) return false;
  source.setData(buildIsochroneData(feature));
  return true;
};

/**
 * Remove tudo que attachIsochroneLayers criou.
 *
 * Cada checagem antes de remover existe porque a desmontagem pode vir do próprio
 * map.remove(), quando a style já não existe mais.
 *
 * @param {any} map
 */
export const detachIsochroneLayers = (map) => {
  if (!map) return;

  for (const layerId of ISOCHRONE_LAYER_IDS) {
    if (map.getLayer?.(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource?.(ISOCHRONE_SOURCE_ID)) map.removeSource(ISOCHRONE_SOURCE_ID);
};
