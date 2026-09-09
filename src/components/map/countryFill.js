// Pintura do TERRITÓRIO de cada país no globo — é aqui que visitado e wishlist
// se distinguem, e só aqui.
//
// O badge é identificação do país e nada mais: bandeira e nome, igual para todo
// mundo. Quem responde "onde eu já fui" é o mapa em si, como no Leaflet — o
// território ganha cor e a leitura vira geográfica, não uma lista de pills
// coloridos flutuando.
//
// A cor é data-driven: uma expression do MapLibre lê `alpha3` da feature e
// decide. Marcar um país novo é trocar a expression (setPaintProperty), sem
// reenviar geometria nenhuma para o worker.
//
// Este módulo não importa maplibre-gl: as funções de attach/repaint/detach
// recebem o mapa como parâmetro e só chamam métodos públicos dele. É o que
// permite exercitá-las com um mapa falso no teste, sem browser nem WebGL — e foi
// assim que o bug do `isStyleLoaded` (ver isStyleReady) ficou coberto.
import { COLORS } from '../../utils/constants';
import { getGeoCountryAlpha3 } from '../../utils/geo-country-utils';

export const COUNTRY_SOURCE_ID = 'journi-countries';
export const COUNTRY_FILL_LAYER_ID = 'journi-country-fill';
export const COUNTRY_OUTLINE_LAYER_ID = 'journi-country-outline';

// Roxo Journi por baixo, satélite por cima da metade do caminho: o país fica
// claramente marcado sem virar um adesivo opaco que apaga a imagem.
export const VISITED_FILL_COLOR = COLORS.primary;
export const VISITED_FILL_OPACITY = 0.5;

// Wishlist em branco: sobre satélite escuro ele lê como "iluminado", e é neutro
// o bastante para não competir com o roxo de quem já foi.
//
// Opacidade MAIOR que a do visitado, o que parece invertido mas não é: o roxo é
// uma cor saturada e escura, que se destaca de quase qualquer terreno; o branco
// só ganha contraste contra fundo escuro, e sobre deserto, neve ou nuvem ele
// desaparecia em 0,3. São dois números calibrados para o mesmo resultado
// percebido, não para o mesmo valor.
export const WISHLIST_FILL_COLOR = COLORS.white;
export const WISHLIST_FILL_OPACITY = 0.6;

// País não marcado não recebe pintura nenhuma — só o satélite.
const TRANSPARENT = 'rgba(0,0,0,0)';

// O contorno é o que segura a leitura de um fill translúcido: sobre imagem de
// satélite, 30% de branco sozinho vira névoa e a fronteira some. Mesma cor do
// fill, opacidade maior.
export const OUTLINE_WIDTH = 1.2;
export const VISITED_OUTLINE_OPACITY = 0.9;
export const WISHLIST_OUTLINE_OPACITY = 0.75;

// Contorno BASE, de todo país — inclusive o não marcado.
//
// Antes o fallback era opacidade 0: quem não tinha marcação dependia só da
// fronteira do basemap, que é uma linha preta tracejada (`boundary_country` da
// alidade_satellite, `line-color: #000`). Preto sobre satélite escuro no zoom
// inicial do globo é invisível na prática, e o efeito era um continente inteiro
// virando uma mancha cinza única — a África, com poucos países marcados, era o
// caso mais gritante.
//
// Branco e não a cor do fill: o país sem marcação não tem estado nenhum para
// comunicar, e reaproveitar roxo ou branco-de-wishlist aqui inventaria um
// terceiro significado. O branco a 0,32 lê como "borda do mapa", não como
// marcação — é a linha do desenho, não um status.
//
// A hierarquia é mantida por DOIS canais somados, não só pela opacidade: 0,32
// contra 0,75/0,9 na opacidade, e 0,7 contra 1,2 na largura. Somado a isso, o
// país marcado tem FILL e o não marcado não tem — é esse o sinal dominante. Um
// país marcado continua saltando; o não marcado apenas deixa de sumir.
//
// Os números saíram de comparação visual no globo real (zoom 1.4, África, que é
// onde o problema aparecia): 0,22 ainda sumia sobre a selva do Congo, e 0,45
// acendia um halo branco em toda linha de costa, porque o contorno do polígono
// segue o litoral também.
export const BASE_OUTLINE_COLOR = COLORS.white;
export const BASE_OUTLINE_OPACITY = 0.32;
export const BASE_OUTLINE_WIDTH = 0.7;

const codeList = (codes) => [...(codes ?? [])].filter(Boolean).sort();

/**
 * Expression que classifica a feature em visitado / wishlist / nada.
 *
 * Visitado vence wishlist, igual ao status do badge (ver countryStatus.js): já
 * foi, então "quero ir" virou histórico.
 *
 * `in` com array literal aceita lista vazia sem reclamar — importante, porque
 * usuário sem marcação nenhuma é o estado inicial de todo mundo. Um `match` com
 * rótulos vazios seria erro de style.
 *
 * O retorno é `any` de propósito: os tipos de expression do MapLibre são tuplas
 * literais, e nenhuma anotação estrutural em JSDoc convence o TS de que um array
 * montado em runtime é uma delas.
 *
 * @returns {any} expression do MapLibre
 */
const classify = (visited, wishlist, visitedValue, wishlistValue, fallback) => [
  'case',
  ['in', ['get', 'alpha3'], ['literal', codeList(visited)]],
  visitedValue,
  ['in', ['get', 'alpha3'], ['literal', codeList(wishlist)]],
  wishlistValue,
  fallback,
];

/**
 * @param {Set<string>|string[]} visited códigos alpha-3
 * @param {Set<string>|string[]} wishlist códigos alpha-3
 */
export const fillColorExpression = (visited, wishlist) =>
  classify(visited, wishlist, VISITED_FILL_COLOR, WISHLIST_FILL_COLOR, TRANSPARENT);

export const fillOpacityExpression = (visited, wishlist) =>
  classify(visited, wishlist, VISITED_FILL_OPACITY, WISHLIST_FILL_OPACITY, 0);

export const outlineColorExpression = (visited, wishlist) =>
  classify(visited, wishlist, VISITED_FILL_COLOR, WISHLIST_FILL_COLOR, BASE_OUTLINE_COLOR);

export const outlineOpacityExpression = (visited, wishlist) =>
  classify(
    visited,
    wishlist,
    VISITED_OUTLINE_OPACITY,
    WISHLIST_OUTLINE_OPACITY,
    BASE_OUTLINE_OPACITY
  );

/**
 * Largura do contorno, também por estado.
 *
 * É o segundo canal da hierarquia: se só a opacidade separasse o país marcado do
 * não marcado, subir a base até ela ficar visível no globo inteiro começaria a
 * competir com a marcação. Com a largura entrando junto, a base pode ser fina e
 * discreta e ainda assim desenhar a fronteira.
 */
export const outlineWidthExpression = (visited, wishlist) =>
  classify(visited, wishlist, OUTLINE_WIDTH, OUTLINE_WIDTH, BASE_OUTLINE_WIDTH);

/**
 * Normaliza o GeoJSON do mundo para o que a fill layer precisa.
 *
 * O código ISO mora em lugares diferentes conforme a feature (`code` nas nações
 * do Reino Unido, `ISO3166-1-Alpha-3`, `ISO3166-1-Alpha-2`, ou nem isso — ver
 * geo-country-utils.js). Expression do MapLibre não sabe fazer essa
 * conciliação, então ela acontece uma vez aqui e cada feature sai com um
 * `alpha3` só.
 *
 * Features sem código ISO ficam de fora: sem código não há como cruzar com as
 * marcações do usuário, e elas são justamente as que não são países (bases
 * militares, territórios em disputa). É o mesmo corte que buildCountryAnchors
 * faz para os badges, então território e badge concordam sobre o que existe.
 *
 * As geometrias entram por referência — só as propriedades são novas. O GeoJSON
 * vem do cache compartilhado do geoService, e reescrever as
 * propriedades no objeto original vazaria para eles.
 *
 * @param {{ type?: string, features?: any[] } | null} geoData
 * @returns {{ type: 'FeatureCollection', features: any[] }}
 */
export const buildCountryFillData = (geoData) => {
  const features = [];

  for (const feature of geoData?.features ?? []) {
    const alpha3 = getGeoCountryAlpha3(feature);
    if (!alpha3 || !feature?.geometry) continue;

    features.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: { alpha3 },
    });
  }

  return { type: 'FeatureCollection', features };
};

/**
 * Onde inserir a fill layer.
 *
 * Antes do primeiro symbol layer da style (no Alidade Satellite,
 * `highway_name_other`): assim o território pintado fica ACIMA do satélite e
 * ABAIXO de todo rótulo, e os nomes de cidade continuam legíveis por cima da
 * cor. Sem isso o fill cobriria os labels e o mapa perderia a orientação
 * justamente no zoom em que ela importa.
 *
 * @param {Array<{ id: string, type: string }>} layers layers da style carregada
 * @returns {string | undefined} undefined = inserir no topo (style sem symbol)
 */
export const findFirstSymbolLayerId = (layers) =>
  (layers ?? []).find((layer) => layer?.type === 'symbol')?.id;

/**
 * Dá para pendurar source e layer neste mapa agora?
 *
 * NÃO use `map.isStyleLoaded()` para isso. No MapLibre v6 ele responde
 * `Style.loaded()`, que só é true quando TODOS os tiles em vista terminaram de
 * carregar (`tileManagers[id].loaded()`) e o imageManager está pronto. Num globo
 * de satélite os tiles entram em streaming o tempo todo, então esse método passa
 * boa parte da vida em false — inclusive no instante em que o GeoJSON dos países
 * chega da rede. Foi exatamente isso que impediu a fill layer de existir: a
 * checagem barrava o efeito, o efeito não tinha por que rodar de novo, e nenhum
 * erro aparecia no console.
 *
 * O que realmente importa é a style estar PARSEADA, e para isso basta ela já ter
 * layers. addLayer/addSource funcionam a partir daí, com tile pendente ou não.
 *
 * @param {any} map
 */
export const isStyleReady = (map) => Boolean(map?.getStyle?.()?.layers?.length);

/**
 * Cria source, fill e contorno. Idempotente: chamar de novo com o mapa já
 * montado só atualiza os dados, não duplica layer.
 *
 * @param {any} map
 * @param {{ data: any, visited?: Set<string>|string[], wishlist?: Set<string>|string[] }} options
 * @returns {boolean} false quando não havia o que fazer (style crua ou sem dados)
 */
export const attachCountryLayers = (map, { data, visited, wishlist }) => {
  if (!map || !isStyleReady(map) || !data?.features?.length) return false;

  if (map.getSource(COUNTRY_SOURCE_ID)) {
    map.getSource(COUNTRY_SOURCE_ID).setData(data);
  } else {
    map.addSource(COUNTRY_SOURCE_ID, { type: 'geojson', data });
  }

  const beforeId = findFirstSymbolLayerId(map.getStyle()?.layers);

  if (!map.getLayer(COUNTRY_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: COUNTRY_FILL_LAYER_ID,
        type: 'fill',
        source: COUNTRY_SOURCE_ID,
        paint: {
          'fill-color': fillColorExpression(visited, wishlist),
          'fill-opacity': fillOpacityExpression(visited, wishlist),
        },
      },
      beforeId
    );
  }

  if (!map.getLayer(COUNTRY_OUTLINE_LAYER_ID)) {
    map.addLayer(
      {
        id: COUNTRY_OUTLINE_LAYER_ID,
        type: 'line',
        source: COUNTRY_SOURCE_ID,
        paint: {
          'line-color': outlineColorExpression(visited, wishlist),
          'line-opacity': outlineOpacityExpression(visited, wishlist),
          'line-width': outlineWidthExpression(visited, wishlist),
        },
      },
      beforeId
    );
  }

  return true;
};

/**
 * Repinta o que já está no mapa — é o caminho de marcar/desmarcar um país.
 *
 * Só as expressions de cor mudam: a geometria já está no worker e não é
 * reenviada.
 *
 * @param {any} map
 * @param {{ visited?: Set<string>|string[], wishlist?: Set<string>|string[] }} options
 * @returns {boolean} false quando as layers ainda não existem
 */
export const repaintCountryLayers = (map, { visited, wishlist }) => {
  if (!map?.getLayer?.(COUNTRY_FILL_LAYER_ID)) return false;

  map.setPaintProperty(COUNTRY_FILL_LAYER_ID, 'fill-color', fillColorExpression(visited, wishlist));
  map.setPaintProperty(
    COUNTRY_FILL_LAYER_ID,
    'fill-opacity',
    fillOpacityExpression(visited, wishlist)
  );

  if (map.getLayer(COUNTRY_OUTLINE_LAYER_ID)) {
    map.setPaintProperty(
      COUNTRY_OUTLINE_LAYER_ID,
      'line-color',
      outlineColorExpression(visited, wishlist)
    );
    map.setPaintProperty(
      COUNTRY_OUTLINE_LAYER_ID,
      'line-opacity',
      outlineOpacityExpression(visited, wishlist)
    );
    // A largura entrou na hierarquia junto com a cor, então ela também é
    // repintada: sem isto, desmarcar um país deixaria a linha grossa para trás.
    map.setPaintProperty(
      COUNTRY_OUTLINE_LAYER_ID,
      'line-width',
      outlineWidthExpression(visited, wishlist)
    );
  }

  return true;
};

/**
 * Liga o clique no território ao callback da tela.
 *
 * O handler é registrado PARA A LAYER (`map.on('click', layerId, ...)`), então o
 * MapLibre já faz o hit-test do polígono e só chama de volta quando o clique
 * caiu dentro de um país. O cursor vira mãozinha em cima do território, que é o
 * que avisa que dá para clicar.
 *
 * @param {any} map
 * @param {(alpha3: string) => void} onSelect
 * @returns {() => void} função de limpeza
 */
export const bindCountryClick = (map, onSelect) => {
  if (!map?.on) return () => {};

  const handleClick = (event) => {
    const alpha3 = event?.features?.[0]?.properties?.alpha3;
    if (alpha3) onSelect(alpha3);
  };
  const enter = () => {
    map.getCanvas().style.cursor = 'pointer';
  };
  const leave = () => {
    map.getCanvas().style.cursor = '';
  };

  map.on('click', COUNTRY_FILL_LAYER_ID, handleClick);
  map.on('mouseenter', COUNTRY_FILL_LAYER_ID, enter);
  map.on('mouseleave', COUNTRY_FILL_LAYER_ID, leave);

  return () => {
    map.off('click', COUNTRY_FILL_LAYER_ID, handleClick);
    map.off('mouseenter', COUNTRY_FILL_LAYER_ID, enter);
    map.off('mouseleave', COUNTRY_FILL_LAYER_ID, leave);
  };
};

/**
 * Remove tudo que attachCountryLayers criou.
 *
 * Cada checagem antes de remover existe porque a desmontagem pode vir do próprio
 * map.remove(), quando a style já não existe mais.
 *
 * @param {any} map
 */
export const detachCountryLayers = (map) => {
  if (!map) return;
  if (map.getLayer?.(COUNTRY_OUTLINE_LAYER_ID)) map.removeLayer(COUNTRY_OUTLINE_LAYER_ID);
  if (map.getLayer?.(COUNTRY_FILL_LAYER_ID)) map.removeLayer(COUNTRY_FILL_LAYER_ID);
  if (map.getSource?.(COUNTRY_SOURCE_ID)) map.removeSource(COUNTRY_SOURCE_ID);
};
