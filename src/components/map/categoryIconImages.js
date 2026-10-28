// Rasteriza os ícones de categoria e os registra como imagens do mapa.
//
// POR QUE ISTO É UM ARQUIVO SEPARADO. planRoute.js diz QUAIS são os ícones
// (CATEGORY_ICON, um nome do Ionicons por categoria) e essa lista é dado
// compartilhado: a folha de lugares próximos usa a mesma, e o módulo continua
// rodando no teste sem browser. O desenho é outra história — ele precisa de
// canvas, de fonte carregada e do `addImage` do mapa. É a mesma divisão de
// sempre, aplicada a mais um par: vocabulário compartilhado, pintura de
// plataforma.
//
// POR QUE NÃO DÁ PARA USAR O <Ionicons /> AQUI. A layer de símbolo do MapLibre
// não desenha componente React: ela pede uma IMAGEM registrada no mapa, por id.
// Então o glifo é desenhado num canvas e entregue como bitmap — o mesmo caminho
// que o emoji fazia antes, trocando a fonte do sistema pela fonte de ícones.
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_ICON, CATEGORY_ICON_COLOR, categoryIconId } from './planRoute';

// Lado do bitmap, em pixels de dispositivo. 64 com pixelRatio 2 dá um ícone de
// 32 CSS px, nítido em tela retina e pequeno o bastante para os oito caberem no
// atlas sem custo.
const ICON_SIZE = 64;

/** Família da fonte de ícones, como o @expo/vector-icons a registra. */
const FONT_FAMILY = typeof Ionicons.getFontFamily === 'function'
  ? Ionicons.getFontFamily()
  : 'ionicons';

const FONT_SPEC = `${ICON_SIZE * 0.72}px "${FONT_FAMILY}"`;

/**
 * A fonte de ícones está pronta para desenhar no canvas?
 *
 * Isto NÃO é zelo: `fillText` com uma fonte que o documento ainda não carregou
 * não falha nem avisa — ele desenha o retângulo vazio do caractere ausente, o
 * "tofu". No app o Ionicons já está em uso na tab bar e nos botões, então a
 * fonte quase sempre está pronta; dentro do DOM Component do globo, que é outro
 * documento, ela pode não estar.
 */
const fontReady = () => {
  const fonts = /** @type {any} */ (globalThis).document?.fonts;
  if (!fonts?.check) return true; // Sem a Font Loading API, tentar é o melhor palpite.
  try {
    return fonts.check(FONT_SPEC);
  } catch {
    return true;
  }
};

const glyphFor = (category) => {
  const name = CATEGORY_ICON[category] || CATEGORY_ICON.outro;
  const codepoint = Ionicons.glyphMap?.[name];
  return typeof codepoint === 'number' ? String.fromCodePoint(codepoint) : '';
};

/**
 * Desenha um ícone e devolve os pixels, ou `null` quando não deu.
 */
const renderIcon = (category) => {
  const glyph = glyphFor(category);
  if (!glyph) return null;

  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.font = FONT_SPEC;
  context.fillStyle = CATEGORY_ICON_COLOR;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  // A sombra faz o papel do halo do rótulo ao lado: o ícone é claro e o satélite
  // por baixo pode ser deserto ou nuvem.
  context.shadowColor = 'rgba(13,19,38,0.85)';
  context.shadowBlur = 6;
  context.fillText(glyph, ICON_SIZE / 2, ICON_SIZE / 2);

  return context.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
};

/**
 * Registra os oito ícones de categoria como imagens do mapa.
 *
 * Quando a fonte ainda não está pronta, o registro é adiado em vez de gravar
 * tofu no atlas: as imagens do MapLibre são registradas UMA vez e ficam, então
 * um desenho ruim aqui seria um desenho ruim para o resto da sessão. O
 * `document.fonts.ready` resolve assim que a folha de fontes termina, e aí o
 * mapa é avisado para repintar.
 *
 * @param {any} map
 */
export const registerCategoryIcons = (map) => {
  if (!map?.addImage || typeof document === 'undefined') return;

  if (!fontReady()) {
    const fonts = /** @type {any} */ (document).fonts;
    fonts?.load?.(FONT_SPEC)
      .catch(() => {})
      .finally(() => {
        // O mapa pode ter sido destruído enquanto a fonte carregava.
        if (!map?.addImage || map._removed) return;
        registerCategoryIcons(map);
        map.triggerRepaint?.();
      });
    return;
  }

  for (const category of Object.keys(CATEGORY_ICON)) {
    const id = categoryIconId(category);
    if (map.hasImage?.(id)) continue;

    const image = renderIcon(category);
    if (!image) continue;

    map.addImage(id, image, { pixelRatio: 2 });
  }
};

/** Tira do mapa as imagens que registerCategoryIcons criou. */
export const unregisterCategoryIcons = (map) => {
  if (!map?.removeImage) return;
  for (const category of Object.keys(CATEGORY_ICON)) {
    const id = categoryIconId(category);
    if (map.hasImage?.(id)) map.removeImage(id);
  }
};
