// Configuração compartilhada do globo 3D (MapLibre GL + OpenFreeMap).
// Isolado do componente para poder ser importado tanto no web quanto no native
// (o native usa só as constantes de texto/atribuição, sem tocar no MapLibre).

// Style vetorial pública, sem chave exposta no cliente e sem autorização por
// domínio. Evita que uma implantação nova deixe os tiles em 401.
export const GLOBE_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const GLOBE_MAX_ZOOM = 20;

// Host dos tiles e da style. Separado da URL para o preconnect poder usá-lo.
export const MAP_TILE_ORIGIN = 'https://tiles.openfreemap.org';

/**
 * Abre a conexão com o provedor de tiles antes de o mapa existir.
 *
 * DNS + TCP + TLS com um host novo custa uma ida e volta de rede cada, e nada
 * disso começa antes do primeiro request. Como o primeiro request é a style — e
 * só depois dela os tiles começam —, esse atraso aparece inteiro no tempo até o
 * globo pintar. O preconnect adianta o aperto de mão para o momento em que o
 * módulo é importado, que é o boot do app.
 *
 * A style e os tiles são cacheáveis pelo navegador, então as visitas seguintes
 * aproveitam os recursos já baixados.
 */
export const preconnectToMapTiles = () => {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[rel="preconnect"][href="${MAP_TILE_ORIGIN}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = MAP_TILE_ORIGIN;
  // Os tiles são buscados como recurso anônimo (sem cookie); sem o crossOrigin o
  // browser abriria uma segunda conexão e o preconnect não teria servido.
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
};

export const MAP_DATA_ATTRIBUTION =
  '<a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles Data from OpenStreetMap';

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
