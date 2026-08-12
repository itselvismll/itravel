// Campo de estrelas atrás do globo.
//
// O MapLibre não tem estrelas: a spec de `sky` só expõe cor de céu/horizonte/névoa
// e o `atmosphere-blend` (nada de `star-intensity`, que é coisa do Mapbox). Como
// na projeção globe o canvas fica transparente fora da esfera, o fundo do
// container aparece — então as estrelas são desenhadas atrás do canvas.
//
// Geramos um SVG como data URI em vez de imagem: some do bundle, não faz request
// e não depende de CSP. O PRNG tem semente fixa para o céu ser sempre o mesmo
// (um campo de estrelas que muda a cada render chama atenção pelo motivo errado).
//
// Módulo sem dependência de react-native de propósito: é só string, e roda igual
// no browser e nos testes.

const TILE_SIZE = 700;

// PRNG determinístico (mulberry32) — Math.random() daria um céu diferente a cada carga.
const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const round = (value) => Math.round(value * 100) / 100;

/**
 * Monta o SVG de um tile de estrelas.
 *
 * @param {{ seed?: number, count?: number, size?: number }} [options]
 * @returns {string} SVG cru
 */
export const buildStarfieldSvg = ({ seed = 20260810, count = 190, size = TILE_SIZE } = {}) => {
  const random = createRandom(seed);
  const stars = [];

  for (let i = 0; i < count; i += 1) {
    const cx = round(random() * size);
    const cy = round(random() * size);

    // Poucas estrelas grandes e muitas pequenas — distribuição exponencial dá
    // profundidade; raio uniforme lê como ruído.
    const magnitude = random();
    const radius = round(0.35 + magnitude * magnitude * magnitude * 1.5);
    const opacity = round(0.22 + magnitude * 0.62);

    // Um toque das cores do Journi nas estrelas mais brilhantes, para o céu
    // conversar com a paleta em vez de ser branco puro.
    let fill = '#FFFFFF';
    if (magnitude > 0.93) fill = '#C9B6FF';
    else if (magnitude > 0.86) fill = '#9FD8FF';

    stars.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" opacity="${opacity}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${stars.join(
    ''
  )}</svg>`;
};

/** O mesmo SVG como data URI, pronto para `background-image`. */
export const buildStarfieldDataUri = (options) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(buildStarfieldSvg(options))}")`;

// Dois tiles de tamanhos diferentes: o padrão de repetição some, porque os dois
// só coincidem de novo depois de muito longe.
const STAR_LAYER_NEAR = buildStarfieldDataUri({ seed: 20260810, count: 190, size: 700 });
const STAR_LAYER_FAR = buildStarfieldDataUri({ seed: 77123, count: 120, size: 460 });

// Brilho difuso roxo/azul, tipo nebulosa, para o fundo não ser preto chapado.
const NEBULA =
  'radial-gradient(ellipse 70% 55% at 22% 18%, rgba(108,43,217,0.20), transparent 60%),' +
  'radial-gradient(ellipse 60% 50% at 82% 78%, rgba(0,209,193,0.11), transparent 62%)';

/** Estilo pronto para o container do mapa: nebulosa + duas camadas de estrelas. */
export const STARFIELD_BACKGROUND_STYLE = {
  backgroundImage: `${NEBULA},${STAR_LAYER_NEAR},${STAR_LAYER_FAR}`,
  backgroundRepeat: 'no-repeat, repeat, repeat',
  backgroundSize: 'auto, 700px 700px, 460px 460px',
};
