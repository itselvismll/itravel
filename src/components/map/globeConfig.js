// Configuração compartilhada do globo 3D (MapLibre GL).
//
// A style vem da Stadia (vetorial: fronteiras, rótulos, ruas) e a imagem de
// satélite vem do Mapbox — loadGlobeStyle() abaixo é onde as duas se juntam.
// Isolado do componente para poder ser importado tanto no web quanto no native
// (o native usa só as constantes de texto/atribuição, sem tocar no MapLibre).
import { API_CONFIG } from '../../utils/constants';

// Alidade Satellite: imagem de satélite/aérea (layer raster `imagery`) com
// labels e contornos vetoriais por cima. É o visual do globo do Journi — o
// terreno real é o que faz o país pintado de roxo ler como território visitado.
// https://docs.stadiamaps.com/map-styles/alidade-satellite/
//
// A style CONTINUA sendo a alidade_satellite: as camadas vetoriais dela (as
// fronteiras escuras, os rótulos claros, o ajuste de brilho/contraste do layer
// `imagery`) são desenhadas para ficar por cima de uma foto, e nenhuma outra
// style da Stadia lê bem sobre satélite. O que mudou é só DE ONDE VEM A FOTO: a
// imagem da Stadia saiu e entrou a do Mapbox — ver MAPBOX_SATELLITE_SOURCE e
// loadGlobeStyle(). O curativo de silenciar o 403 da imagem virou reserva.
const STADIA_STYLE_ID = 'alidade_satellite';

// A key vem de EXPO_PUBLIC_STADIA_API_KEY. Em localhost e nos domínios
// autorizados no painel da Stadia ela é opcional; fora deles a style e os tiles
// respondem 401 e o globo fica sem imagem. Toda implantação nova precisa do
// domínio cadastrado na Stadia OU da key presente no build.
export const GLOBE_STYLE_URL = `https://tiles.stadiamaps.com/styles/${STADIA_STYLE_ID}.json${
  API_CONFIG.STADIA_API_KEY ? `?api_key=${API_CONFIG.STADIA_API_KEY}` : ''
}`;

export const GLOBE_MAX_ZOOM = 20;

// Hosts dos tiles e da style. Separados das URLs para o preconnect poder usá-los.
export const STADIA_ORIGIN = 'https://tiles.stadiamaps.com';
export const MAPBOX_ORIGIN = 'https://api.mapbox.com';

/** Id da source raster de imagem dentro da style da Stadia. É esta source que
 * loadGlobeStyle() troca — o layer `imagery` que a consome, com o ajuste de
 * brilho/contraste/saturação da style, fica exatamente como está. */
const IMAGERY_SOURCE_ID = 'imagery';

/* ----------------------------------------------------------------------------
 * CONFIG ANTIGA (satélite da Stadia), MANTIDA COMENTADA PARA REVERTER RÁPIDO.
 *
 * Não era escrita aqui: era a source `imagery` que já vem dentro do JSON da
 * style alidade_satellite, reproduzida abaixo como estava.
 *
 *   imagery: {
 *     type: 'raster',
 *     url: 'https://tiles.stadiamaps.com/data/imagery.json',
 *     tileSize: 512,
 *     minzoom: 0,
 *     maxzoom: 18,
 *     scheme: 'xyz',
 *     attribution:
 *       '© CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data)',
 *   }
 *
 * Por que saiu: o plano Stadia Starter não inclui satélite. Em localhost a
 * Stadia servia os tiles assim mesmo e a imagem aparecia, então o problema ficou
 * invisível no desenvolvimento — em produção (journi.expo.app) cada tile de
 * /data/imagery/ respondia 403 e o globo ficava sem foto nenhuma.
 *
 * Para voltar: apague o `sources[IMAGERY_SOURCE_ID] = ...` de loadGlobeStyle()
 * — a style da Stadia já traz esta source pronta — e devolva a atribuição antiga
 * em SATELLITE_IMAGERY_ATTRIBUTION.
 * -------------------------------------------------------------------------- */

/** Tileset de satélite do Mapbox. */
const MAPBOX_SATELLITE_TILESET = 'mapbox.satellite';

/**
 * Source raster do satélite do Mapbox (Raster Tiles API).
 * https://docs.mapbox.com/api/maps/raster-tiles/
 *
 * `@2x` + `tileSize: 512`, e não a variante sem sufixo com 256.
 *
 * A comparação "39 KB (512) contra 14 KB (256), medido no zoom 2" que justificava
 * o 256 aqui media os dois no MESMO zoom — e nesse zoom eles não cobrem a mesma
 * coisa. Um tile de 512 cobre o mesmo chão que QUATRO tiles de 256 do nível
 * seguinte. Para a mesma área e a mesma resolução na tela:
 *
 *   256 -> 4 requisições x 14 KB = 56 KB
 *   512 -> 1 requisição  x 39 KB = 39 KB
 *
 * Ou seja, por pixel o 512 é ~30% mais BARATO (0,149 B/px contra 0,214 B/px), e
 * não mais caro. É o esperado: JPEG comprime melhor em área maior, porque o
 * overhead de cabeçalho e de blocos de borda se dilui.
 *
 * O ganho maior nem é o byte: é 4× menos requisições, decodificações de JPEG e
 * uploads de textura para a GPU — trabalho que acontece durante o movimento da
 * câmera, que é onde o gesto engasga.
 *
 * O `@2x` é o que torna isso possível sem borrar: ele devolve um tile de 512 de
 * verdade. Declarar 512 na variante sem sufixo é que faria o MapLibre esticar
 * uma imagem de 256 e o globo sairia borrado.
 *
 * `.jpg90` é JPEG com qualidade 90, o formato mais leve para foto. Tiles que
 * incluem mapbox.satellite voltam como JPEG de qualquer jeito, mesmo se a URL
 * pedir PNG.
 *
 * maxzoom 22 é o do tileset (a Stadia parava em 18) — acima do GLOBE_MAX_ZOOM de
 * 20, então o globo nunca precisa esticar tile.
 *
 * @type {import('@maplibre/maplibre-gl-style-spec').RasterSourceSpecification | null}
 */
export const MAPBOX_SATELLITE_SOURCE = API_CONFIG.MAPBOX_TOKEN
  ? {
      type: 'raster',
      tiles: [
        `${MAPBOX_ORIGIN}/v4/${MAPBOX_SATELLITE_TILESET}/{z}/{x}/{y}@2x.jpg90?access_token=${API_CONFIG.MAPBOX_TOKEN}`,
      ],
      tileSize: 512,
      minzoom: 0,
      maxzoom: 22,
      scheme: 'xyz',
    }
  : null;

/** Busca da style, feita uma vez por sessão e compartilhada entre os dois globos
 * (o da tela de Mapa e o do onboarding). Se falhar, o cache é solto para a
 * próxima montagem poder tentar de novo. */
let globeStyleRequest = null;
const fetchGlobeStyleOnce = () => {
  if (!globeStyleRequest) {
    globeStyleRequest = fetch(GLOBE_STYLE_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Falha ao carregar a style do mapa (HTTP ${response.status})`);
        }
        return response.json();
      })
      .catch((error) => {
        globeStyleRequest = null;
        throw error;
      });
  }
  return globeStyleRequest;
};

/**
 * A style do globo: a alidade_satellite da Stadia com a imagem trocada pela do
 * Mapbox.
 *
 * Por que buscar a style aqui em vez de passar a URL direto para o MapLibre: a
 * source de satélite mora DENTRO do JSON da style, e a única forma de trocar uma
 * source antes de o mapa existir é entregar o objeto da style já montado. Trocar
 * depois, no `style.load`, chegaria tarde — os tiles da Stadia já teriam saído,
 * e com eles os 403 que esta migração existe para acabar.
 *
 * Não custa uma requisição a mais: é a MESMA busca que o MapLibre faria sozinho
 * a partir da URL, e a Stadia responde com `cache-control: max-age=86400`, então
 * da segunda visita em diante ela nem sai da máquina.
 *
 * Sem token do Mapbox a style volta intacta, com a imagery da Stadia — o globo
 * degrada para o comportamento antigo (403 silencioso) em vez de quebrar.
 *
 * @returns {Promise<import('@maplibre/maplibre-gl-style-spec').StyleSpecification>}
 */
export const loadGlobeStyle = async () => {
  const style = await fetchGlobeStyleOnce();

  // Cópia: o MapLibre MUTA o objeto de style que recebe, e os dois globos dividem
  // este cache.
  const copy = structuredClone(style);
  if (MAPBOX_SATELLITE_SOURCE) {
    copy.sources[IMAGERY_SOURCE_ID] = { ...MAPBOX_SATELLITE_SOURCE };
  }
  return copy;
};

/**
 * Abre a conexão com a Stadia e com o Mapbox antes de o mapa existir.
 *
 * DNS + TCP + TLS com um host novo custa uma ida e volta de rede cada, e nada
 * disso começa antes do primeiro request. Como o primeiro request é a style — e
 * só depois dela os tiles começam —, esse atraso aparece inteiro no tempo até o
 * globo pintar. O preconnect adianta o aperto de mão para o momento em que o
 * módulo é importado, que é o boot do app.
 *
 * A style em si já é cacheada pelo browser: a Stadia responde com
 * `cache-control: public, max-age=86400`, então da segunda visita em diante ela
 * nem sai da máquina.
 *
 * São DOIS hosts porque a imagem e o vetor vêm de provedores diferentes: a foto
 * do api.mapbox.com, o resto da style do tiles.stadiamaps.com. O do Mapbox é o
 * que mais rende: os tiles de satélite são o volume de requisições do globo, e
 * eles só começam depois que a style chega.
 */
export const preconnectToTileHosts = () => {
  if (typeof document === 'undefined') return;

  [STADIA_ORIGIN, MAPBOX_ORIGIN].forEach((origin) => {
    if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    // Os tiles são buscados como recurso anônimo (sem cookie); sem o crossOrigin o
    // browser abriria uma segunda conexão e o preconnect não teria servido.
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
};

// Crédito extra obrigatório da imagem de satélite — agora do Mapbox. É o que a
// própria TileJSON do mapbox.satellite declara, e os termos do Mapbox exigem os
// links. Os créditos de Stadia/OpenMapTiles/OpenStreetMap já vêm dentro da style
// JSON e são renderizados automaticamente pelo AttributionControl.
//
// Crédito antigo (satélite da Stadia), para reverter junto com a source:
//   '© CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data)'
export const SATELLITE_IMAGERY_ATTRIBUTION =
  '<a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener">© Mapbox</a> ' +
  '<a href="https://www.maxar.com/" target="_blank" rel="noopener">© Maxar</a>';

// Caminhos de tile de satélite. São eles que distinguem o 403 aceito — imagem
// que a conta não tem direito de servir naquele domínio — de qualquer outra
// falha do mapa.
//
// São DOIS porque a migração é reversível: o do Mapbox é o caminho atual, o da
// Stadia continua coberto para o caso de a config antiga voltar. Um caminho a
// mais aqui não afrouxa a checagem — ela exige caminho E status.
const SATELLITE_TILE_PATHS = [
  // Mapbox Raster Tiles API (atual). 403 aqui = token restrito a outras URLs no
  // painel do Mapbox, ou conta sem acesso ao tileset.
  '/v4/mapbox.satellite/',
  // Stadia (config antiga, comentada acima). 403 = plano Starter sem satélite.
  '/data/imagery/',
];

/** Status do tile sem direito de acesso. O 401 (token/key ausente ou inválido)
 * fica DE FORA de propósito: esse é acionável e continua aparecendo. */
const SATELLITE_TILE_FORBIDDEN = 403;

/**
 * Padrão para o LogBox ignorar o 403 de satélite no dev NATIVO.
 *
 * Deliberadamente estreito: casa a URL do tile de imagem — do Mapbox ou da
 * Stadia — junto com o 403. Qualquer outro erro, inclusive outro 403 de outra
 * URL, continua aparecendo. Nada de ignoreAllLogs.
 */
export const SATELLITE_TILE_LOG_PATTERN =
  /(api\.mapbox\.com\/v4\/mapbox\.satellite\/.*\b403\b)|(\b403\b.*api\.mapbox\.com\/v4\/mapbox\.satellite\/)|(tiles\.stadiamaps\.com\/data\/imagery\/.*\b403\b)|(\b403\b.*tiles\.stadiamaps\.com\/data\/imagery\/)/;

/**
 * É o 403 de um tile de satélite que a conta não tem direito de servir aqui?
 *
 * O MapLibre entrega um AJAXError no evento `error`, com `status` e `url`
 * próprios; a leitura da mensagem existe só como rede de segurança para quando o
 * erro chega embrulhado e perde os campos.
 *
 * A checagem exige as DUAS coisas — um caminho de imagem conhecido (Mapbox ou
 * Stadia) E o 403. Um 403 em outra URL, ou qualquer outro erro nos tiles de
 * imagem, passa direto e continua visível: o que se aceita aqui é só a falha já
 * conhecida e diagnosticada.
 *
 * @param {{ status?: number, url?: string, message?: string } | null | undefined} error
 * @returns {boolean}
 */
export const isSatelliteTileError = (error) => {
  if (!error) return false;

  const target = `${error.url ?? ''} ${error.message ?? ''}`;
  if (!SATELLITE_TILE_PATHS.some((path) => target.includes(path))) return false;

  return (
    error.status === SATELLITE_TILE_FORBIDDEN ||
    target.includes(`(${SATELLITE_TILE_FORBIDDEN})`) ||
    target.includes(`${SATELLITE_TILE_FORBIDDEN} `)
  );
};

// Vista inicial: globo inteiro, levemente inclinado para o norte.
export const GLOBE_INITIAL_VIEW = {
  /** @type {[number, number]} */
  center: [0, 20],
  zoom: 1.4,
  minZoom: 0,
};

// Fundo escuro atrás do globo para dar contraste e leitura melhor da esfera
// contra o "espaço". As estrelas entram por cima dele
// (ver starfield.js).
export const GLOBE_SPACE_BACKGROUND = '#05070F';

// Atmosfera do globo. Na projeção globe o MapLibre desenha o halo a partir das
// cores de `sky`/`horizon`, e `atmosphere-blend` controla a intensidade.
// O interpolate por zoom desliga o efeito quando a câmera chega perto da
// superfície (aí o globo já virou plano e o halo só sujaria a imagem).
/** @type {import('@maplibre/maplibre-gl-style-spec').SkySpecification} */
export const GLOBE_SKY = {
  'sky-color': '#123A8A',
  'horizon-color': '#7FC4FF',
  'fog-color': '#0D1326',
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.6,
  'fog-ground-blend': 0.4,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
};

// Classes do controle de atribuição do MapLibre. Elas fazem parte do CSS público
// da lib (maplibre-gl.css), então mexer nelas é mais estável do que tocar nos
// campos privados do controle.
const ATTRIB_CONTROL_SELECTOR = '.maplibregl-ctrl-attrib';
const ATTRIB_EXPANDED_CLASS = 'maplibregl-compact-show';

/**
 * Faz a atribuição nascer RECOLHIDA, como só o ícone ⓘ.
 *
 * O `compact: true` sozinho não resolve: ele deixa o controle no modo compacto,
 * mas o `_updateCompact` do MapLibre adiciona `maplibregl-compact-show` JUNTO com
 * `maplibregl-compact` — ou seja, o modo compacto começa aberto, e a única coisa
 * que fecha ele sozinho é um `drag` do mapa. Não existe opção de estado inicial
 * na API. Então tiramos a classe de expandido assim que ela aparece.
 *
 * A remoção é de UMA vez só, e é isso que faz o ⓘ continuar funcionando: depois
 * do primeiro recolhimento paramos de escutar, então o clique do usuário abre a
 * atribuição e ela FICA aberta. Um listener permanente fecharia o painel na cara
 * de quem acabou de abri-lo.
 *
 * A atribuição em si não sai do mapa — continua completa atrás do ícone, como
 * exigem a Stadia, o Mapbox e o OpenStreetMap.
 *
 * @param {import('maplibre-gl').Map} map
 * @returns {() => void} desinscrição, para o cleanup do componente
 */
export const collapseAttributionOnce = (map) => {
  let done = false;

  const collapse = () => {
    if (done) return;
    const controls = map
      .getContainer()
      ?.querySelectorAll(`${ATTRIB_CONTROL_SELECTOR}.${ATTRIB_EXPANDED_CLASS}`);
    if (!controls?.length) return;

    controls.forEach((control) => control.classList.remove(ATTRIB_EXPANDED_CLASS));
    done = true;
    detach();
  };

  // O controle só ganha as classes de compacto quando JÁ tem texto de atribuição,
  // e o texto vem da style e das sources — que chegam depois da montagem. Por
  // isso escutamos os eventos de dados, e não só o momento do addControl.
  const detach = () => {
    map.off('styledata', collapse);
    map.off('sourcedata', collapse);
    map.off('resize', collapse);
  };

  collapse();
  map.on('styledata', collapse);
  map.on('sourcedata', collapse);
  map.on('resize', collapse);

  return detach;
};
