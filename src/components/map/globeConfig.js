// Configuração compartilhada do globo 3D (MapLibre GL + Stadia Maps).
// Isolado do componente para poder ser importado tanto no web quanto no native
// (o native usa só as constantes de texto/atribuição, sem tocar no MapLibre).
import { API_CONFIG } from '../../utils/constants';

// Alidade Satellite: imagem de satélite/aérea (layer raster `imagery`) com
// labels e contornos vetoriais por cima. É o visual do globo do Journi — o
// terreno real é o que faz o país pintado de roxo ler como território visitado.
// https://docs.stadiamaps.com/map-styles/alidade-satellite/
//
// SOLUÇÃO TEMPORÁRIA, ESCOLHIDA DE OLHOS ABERTOS: o plano Stadia Starter não
// inclui satélite. Onde a conta não tem direito à imagem, cada tile de
// /data/imagery/ responde 403 — são requisições que falham a cada quadro, e o
// erro delas fica SILENCIADO por isSatelliteTileError (abaixo). Duas styles
// vetoriais cobertas pelo plano foram testadas no lugar (alidade_smooth_dark e
// outdoors) e o visual do satélite foi preferido mesmo assim.
//
// O silêncio é um curativo, não a cura. As saídas de verdade são:
//   (a) upgrade para o plano Stadia Standard, que cobre satélite;
//   (b) trocar a fonte da imagem pelo satélite gratuito do Esri (World Imagery);
//   (c) voltar para uma style vetorial do plano atual.
const STADIA_STYLE_ID = 'alidade_satellite';

// A key vem de EXPO_PUBLIC_STADIA_API_KEY. Em localhost e nos domínios
// autorizados no painel da Stadia ela é opcional; fora deles a style e os tiles
// respondem 401 e o globo fica sem imagem. Toda implantação nova precisa do
// domínio cadastrado na Stadia OU da key presente no build.
export const GLOBE_STYLE_URL = `https://tiles.stadiamaps.com/styles/${STADIA_STYLE_ID}.json${
  API_CONFIG.STADIA_API_KEY ? `?api_key=${API_CONFIG.STADIA_API_KEY}` : ''
}`;

export const GLOBE_MAX_ZOOM = 20;

// Host dos tiles e da style. Separado da URL para o preconnect poder usá-lo.
export const STADIA_ORIGIN = 'https://tiles.stadiamaps.com';

/**
 * Abre a conexão com a Stadia antes de o mapa existir.
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
 */
export const preconnectToStadia = () => {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[rel="preconnect"][href="${STADIA_ORIGIN}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = STADIA_ORIGIN;
  // Os tiles são buscados como recurso anônimo (sem cookie); sem o crossOrigin o
  // browser abriria uma segunda conexão e o preconnect não teria servido.
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
};

// Crédito extra obrigatório da imagem de satélite do Alidade Satellite. Os créditos
// de Stadia/OpenMapTiles/OpenStreetMap já vêm dentro da style JSON e são renderizados
// automaticamente pelo AttributionControl.
export const SATELLITE_IMAGERY_ATTRIBUTION =
  '© CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data)';

// Caminho dos tiles de satélite da Stadia. É o que distingue o 403 aceito (a
// imagem que o plano não cobre) de qualquer outra falha do mapa.
const SATELLITE_TILE_PATH = '/data/imagery/';

/** Status do tile sem direito de acesso. O 401 (key ausente/domínio não
 * cadastrado) fica DE FORA de propósito: esse é acionável e continua aparecendo. */
const SATELLITE_TILE_FORBIDDEN = 403;

/**
 * Padrão para o LogBox ignorar o 403 de satélite no dev NATIVO.
 *
 * Deliberadamente estreito: casa a URL do tile de imagem da Stadia junto com o
 * 403. Qualquer outro erro — inclusive outro 403, de outra URL — continua
 * aparecendo. Nada de ignoreAllLogs.
 */
export const SATELLITE_TILE_LOG_PATTERN =
  /(tiles\.stadiamaps\.com\/data\/imagery\/.*\b403\b)|(\b403\b.*tiles\.stadiamaps\.com\/data\/imagery\/)/;

/**
 * É o 403 dos tiles de satélite que o plano não cobre?
 *
 * O MapLibre entrega um AJAXError no evento `error`, com `status` e `url`
 * próprios; a leitura da mensagem existe só como rede de segurança para quando o
 * erro chega embrulhado e perde os campos.
 *
 * A checagem exige as DUAS coisas — o caminho da imagem E o 403. Um 403 em outra
 * URL, ou qualquer outro erro nos tiles de imagem, passa direto e continua
 * visível: o que se aceita aqui é só a falha já conhecida e diagnosticada.
 *
 * @param {{ status?: number, url?: string, message?: string } | null | undefined} error
 * @returns {boolean}
 */
export const isSatelliteTileError = (error) => {
  if (!error) return false;

  const target = `${error.url ?? ''} ${error.message ?? ''}`;
  if (!target.includes(SATELLITE_TILE_PATH)) return false;

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
 * exigem a Stadia e o OpenStreetMap.
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
