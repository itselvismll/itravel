// Desenho da área "O que tem por perto" no globo: o polígono da isócrona a pé
// em volta do ponto tocado.
//
// Mesma divisão de planRoute.js e countryFill.js: este módulo decide O QUE
// desenhar e conversa com um mapa só por métodos públicos, sem importar
// `maplibre-gl`. Quem decide QUANDO é o PlanRouteLayer.web.js. É o que permite
// exercitar tudo com um mapa falso no teste, sem browser nem WebGL.
import { findFirstSymbolLayerId } from './countryFill';
import { PLAN_LINE_LAYER_ID, PLAN_LINE_FALLBACK_LAYER_ID } from './planRoute';

/**
 * O DESTAQUE DE ÁREA ESTÁ DESLIGADO.
 *
 * Mesmo padrão do INSTAGRAM_FEATURE_ENABLED (utils/instagram.js): a
 * implementação está completa e funciona, o que está em aberto é uma decisão de
 * produto. Só o DESENHO está condicionado a esta flag — este módulo, as layers,
 * o serviço da isócrona e os testes continuam de pé, e ligar de volta é trocar
 * `false` por `true`.
 *
 * POR QUE FOI DESLIGADO: a leitura da mancha ainda não é boa quando as paradas
 * do dia estão próximas umas das outras. Duas paradas a dois quarteirões têm
 * áreas de quinze minutos quase idênticas, e trocar de parada redesenha uma
 * forma parecida no mesmo lugar — o mapa pisca sem dizer nada de novo. Some-se
 * a isso o reenquadramento de câmera que a área pedia (para não nascer atrás da
 * folha) e o resultado é a câmera se mexendo a cada toque, que é o oposto de
 * discreto.
 *
 * O QUE CONTINUA LIGADO: a busca da isócrona. Ela não é só desenho — é o que
 * define QUAIS lugares entram na lista e recorta a busca da Search Box. Sem
 * ela, "o que tem por perto" viraria "o mais perto em linha reta", que põe na
 * lista o restaurante do outro lado do rio. A área deixou de ser vista; ela não
 * deixou de ser usada.
 */
export const NEARBY_AREA_FEATURE_ENABLED = false;

export const ISOCHRONE_SOURCE_ID = 'journi-isochrone';

export const ISOCHRONE_FILL_LAYER_ID = 'journi-isochrone-fill';
export const ISOCHRONE_OUTLINE_LAYER_ID = 'journi-isochrone-outline';

// Ordem de criação = ordem de empilhamento.
export const ISOCHRONE_LAYER_IDS = [ISOCHRONE_FILL_LAYER_ID, ISOCHRONE_OUTLINE_LAYER_ID];

// O lugar da lista que o usuário tocou.
export const NEARBY_FOCUS_SOURCE_ID = 'journi-nearby-focus';
export const NEARBY_FOCUS_HALO_LAYER_ID = 'journi-nearby-focus-halo';
export const NEARBY_FOCUS_PIN_LAYER_ID = 'journi-nearby-focus-pin';
export const NEARBY_FOCUS_LAYER_IDS = [NEARBY_FOCUS_HALO_LAYER_ID, NEARBY_FOCUS_PIN_LAYER_ID];

// Teal da marca (COLORS.teal). Escolhido por ser a única cor da paleta que NÃO
// está no início do ciclo de dias: o dia 1 é vermelho, o 3 é laranja e o 4 é
// roxo, então um preenchimento nesses tons se confundiria com a rota por cima
// dele. O teal é a cor do dia 2 — e é aí que a opacidade baixa e a ausência de
// traço grosso separam os dois: área é mancha, rota é linha.
export const ISOCHRONE_COLOR = '#00D1C1';

// Baixa de propósito. A área é CONTEXTO — ela responde "até onde dá para ir" e
// tem de deixar ver o satélite, os pinos e a linha do roteiro por baixo. Uma
// mancha opaca esconderia justamente o que o usuário quer olhar dentro dela.
//
// Mais baixa desde que a folha entrou: a área deixou de ser a única resposta na
// tela. Quem lista os lugares alcançáveis agora é o texto, que lê melhor do que
// uma mancha; a área ficou com o papel de mostrar a FORMA do alcance, e para
// isso o contorno basta. Duas informações no mesmo peso disputariam atenção — o
// problema que este redesenho inteiro está resolvendo.
export const ISOCHRONE_FILL_OPACITY = 0.14;

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
          // Subiu de 0,55 para 0,7 e virou tracejado quando a folha passou a
          // abrir por cima da área: com o preenchimento em 0,14, o contorno é o
          // que resta dela na faixa de mapa que sobra acima da lista, e a 0,55
          // ele sumia sobre satélite claro. O traço também separa o limite da
          // caminhada de qualquer via real da style, que é sempre contínua.
          'line-opacity': 0.7,
          'line-dasharray': [3, 2],
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

// ── Destaque do lugar tocado na lista ────────────────────────────────────────
//
// Tocar numa linha da folha precisa responder "é ESTE aqui". A área sozinha não
// responde: ela cobre um bairro inteiro e todos os lugares da lista estão dentro
// dela. Um ponto aceso de cada vez é o suficiente — desenhar os doze lugares no
// mapa devolveria à tela exatamente a poluição que este redesenho tirou dela.

/**
 * Empacota o lugar em foco na FeatureCollection que a source espera.
 * `null` vira coleção vazia, que é como se apaga o destaque sem remover a layer.
 *
 * @param {{ longitude?: number, latitude?: number, name?: string } | null} place
 */
export const buildNearbyFocusData = (place) => {
  const longitude = place?.longitude;
  const latitude = place?.latitude;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return EMPTY;

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: { name: place?.name || '' },
    }],
  };
};

/**
 * Cria a source e as duas layers do destaque. Idempotente.
 *
 * Elas entram ACIMA da área e das paradas (a âncora é o primeiro symbol layer da
 * style, a mesma do roteiro, e quem entra depois fica por cima entre iguais): o
 * ponto aceso é a resposta a um toque que acabou de acontecer, e ficar embaixo
 * de um pino do roteiro seria não responder.
 *
 * @param {any} map
 * @param {{ place?: any }} [options]
 * @returns {boolean} false quando a style ainda está crua
 */
export const attachNearbyFocusLayers = (map, { place } = {}) => {
  if (!map || !styleReady(map)) return false;

  const data = buildNearbyFocusData(place);

  if (map.getSource(NEARBY_FOCUS_SOURCE_ID)) {
    map.getSource(NEARBY_FOCUS_SOURCE_ID).setData(data);
  } else {
    map.addSource(NEARBY_FOCUS_SOURCE_ID, { type: 'geojson', data });
  }

  const beforeId = findFirstSymbolLayerId(map.getStyle?.()?.layers);

  // Anel translúcido: é o que faz o ponto ser encontrado pelo olho sem precisar
  // de animação — que num mapa custa quadro a quadro para sempre.
  if (!map.getLayer(NEARBY_FOCUS_HALO_LAYER_ID)) {
    map.addLayer(
      {
        id: NEARBY_FOCUS_HALO_LAYER_ID,
        type: 'circle',
        source: NEARBY_FOCUS_SOURCE_ID,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 14, 16, 22],
          'circle-color': ISOCHRONE_COLOR,
          'circle-opacity': 0.25,
        },
      },
      beforeId
    );
  }

  if (!map.getLayer(NEARBY_FOCUS_PIN_LAYER_ID)) {
    map.addLayer(
      {
        id: NEARBY_FOCUS_PIN_LAYER_ID,
        type: 'circle',
        source: NEARBY_FOCUS_SOURCE_ID,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 7],
          'circle-color': ISOCHRONE_COLOR,
          // A borda branca é o que separa o ponto do preenchimento da área, que
          // é da MESMA cor — sem ela o destaque some justamente dentro da área
          // onde ele sempre está.
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
        },
      },
      beforeId
    );
  }

  return true;
};

/**
 * Troca só o lugar em foco — inclusive para apagá-lo, passando `null`.
 *
 * @returns {boolean} false quando a source ainda não existe
 */
export const updateNearbyFocusData = (map, place) => {
  const source = map?.getSource?.(NEARBY_FOCUS_SOURCE_ID);
  if (!source) return false;
  source.setData(buildNearbyFocusData(place));
  return true;
};

/** Remove tudo que attachNearbyFocusLayers criou. */
export const detachNearbyFocusLayers = (map) => {
  if (!map) return;

  for (const layerId of NEARBY_FOCUS_LAYER_IDS) {
    if (map.getLayer?.(layerId)) map.removeLayer(layerId);
  }
  if (map.getSource?.(NEARBY_FOCUS_SOURCE_ID)) map.removeSource(NEARBY_FOCUS_SOURCE_ID);
};
