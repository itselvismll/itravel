// Decide quais badges de país cabem escritos e quais colapsam para pill.
//
// O Marker do MapLibre não tem detecção de colisão (diferente das symbol layers,
// que têm), então dois países vizinhos no zoom de globo viram um amontoado. Aqui
// projetamos cada badge para pixels e resolvemos as sobreposições na mão.
//
// Regra que manda: badge NUNCA some por colisão. Quem perde a disputa vira pill
// só com a bandeira — que ocupa ~1/4 da largura e quase sempre passa a caber.
// Some só o que o próprio MapLibre esconde por estar atrás do globo.
//
// Módulo puro: sem DOM, sem MapLibre, sem react-native. É só geometria.

export const EXPANDED = 'expanded';
export const COMPACT = 'compact';

// Folga entre dois badges vizinhos, em pixels.
const DEFAULT_PADDING = 3;

// Banda morta entre os dois estados. Para EXPANDIR, um badge compacto precisa de
// `padding + HYSTERESIS` de folga; para CONTINUAR expandido, basta `padding`.
//
// Sem isso, um badge parado exatamente no limite troca de estado a cada quadro
// de um arrasto lento — o pixel de diferença ora cabe, ora não cabe, e o badge
// fica piscando entre bandeira+nome e pill.
const DEFAULT_HYSTERESIS = 8;

// Lado da célula do grid de colisão, em pixels. Perto da maior largura de badge
// que esperamos, de forma que uma consulta toque poucas células.
const CELL_SIZE = 96;

const intersects = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const boxFor = (candidate, width, padding) => ({
  left: candidate.x - width / 2 - padding,
  right: candidate.x + width / 2 + padding,
  // Os markers são ancorados embaixo ('anchor: bottom'), então a caixa sobe a
  // partir do ponto projetado.
  top: candidate.y - candidate.height - padding,
  bottom: candidate.y + padding,
});

/**
 * Grid esparso de caixas já posicionadas.
 *
 * A versão ingênua compara cada badge com todos os anteriores — O(n²). Com a
 * amostra de 10 países isso é irrelevante, mas o cálculo roda a cada quadro de
 * arrasto e a lista real pode passar de 200 países, o que dá ~20 mil testes por
 * quadro. O grid limita cada consulta às poucas células que a caixa toca.
 */
const createGrid = () => {
  /** @type {Map<string, Array<{left:number,right:number,top:number,bottom:number}>>} */
  const cells = new Map();

  // Percorre as células que a caixa cobre. Chama `visit` em cada uma; se `visit`
  // devolver true, para e devolve true (usado para sair no primeiro conflito).
  const eachCell = (box, visit) => {
    const minX = Math.floor(box.left / CELL_SIZE);
    const maxX = Math.floor(box.right / CELL_SIZE);
    const minY = Math.floor(box.top / CELL_SIZE);
    const maxY = Math.floor(box.bottom / CELL_SIZE);

    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        if (visit(`${cx}:${cy}`)) return true;
      }
    }
    return false;
  };

  return {
    collides: (box) =>
      eachCell(box, (key) => {
        const bucket = cells.get(key);
        return bucket ? bucket.some((other) => intersects(other, box)) : false;
      }),

    insert: (box) => {
      eachCell(box, (key) => {
        const bucket = cells.get(key);
        if (bucket) bucket.push(box);
        else cells.set(key, [box]);
        return false;
      });
    },
  };
};

/**
 * Ordem de prioridade: quem tem mais chance de ficar escrito.
 *
 * Só usa dados que não dependem da câmera (área e código). Se usássemos algo
 * como "distância até o centro da tela", a decisão mudaria a cada arrasto e os
 * badges ficariam piscando entre os dois estados.
 */
const byPriority = (a, b) => {
  const priorityA = a.priority ?? a.area ?? 0;
  const priorityB = b.priority ?? b.area ?? 0;
  if (priorityB !== priorityA) return priorityB - priorityA;
  return a.key < b.key ? -1 : 1;
};

const isPlaceable = (candidate) =>
  candidate.visible &&
  Number.isFinite(candidate.x) &&
  Number.isFinite(candidate.y) &&
  Number.isFinite(candidate.height);

/**
 * @typedef {Object} BadgeCandidate
 * @property {string} key código do país
 * @property {number} x posição projetada em pixels
 * @property {number} y posição projetada em pixels
 * @property {boolean} visible false quando está atrás do globo ou fora da tela
 * @property {number} expandedWidth largura do badge com bandeira + nome
 * @property {number} compactWidth largura do pill só com a bandeira
 * @property {number} height altura do badge (igual nos dois estados)
 * @property {number} [area] área do país, usada como prioridade padrão
 * @property {number} [priority] prioridade explícita (vence a área)
 */

/**
 * Resolve o estado de cada badge.
 *
 * Guloso, em ordem de prioridade: tenta encaixar expandido; se bater em alguém
 * já posicionado, colapsa para pill. O pill entra na lista de ocupados de
 * qualquer jeito — ele nunca é descartado, mesmo que ainda encoste em outro.
 * É essa última parte que garante a regra "nenhum país some": o pior caso de um
 * badge é virar bandeira, nunca desaparecer.
 *
 * Candidatos invisíveis ficam de fora do cálculo (não faz sentido um país do
 * outro lado do globo forçar um visível a encolher) e mantêm o estado anterior,
 * para não trocarem de forma enquanto estão escondidos.
 *
 * @param {BadgeCandidate[]} candidates
 * @param {{
 *   padding?: number,
 *   hysteresis?: number,
 *   previous?: Record<string, 'expanded' | 'compact'>,
 * }} [options]
 * @returns {Record<string, 'expanded' | 'compact'>} um estado para CADA candidato
 */
export const resolveBadgeModes = (
  candidates,
  { padding = DEFAULT_PADDING, hysteresis = DEFAULT_HYSTERESIS, previous = {} } = {}
) => {
  const modes = /** @type {Record<string, 'expanded' | 'compact'>} */ ({});
  const grid = createGrid();

  const placeable = candidates.filter(isPlaceable).sort(byPriority);

  for (const candidate of placeable) {
    // Quem já estava escrito só precisa da folga normal; quem está compacto
    // precisa de folga extra para voltar a abrir. Ver DEFAULT_HYSTERESIS.
    const wasExpanded = (previous[candidate.key] ?? EXPANDED) === EXPANDED;
    const testPadding = padding + (wasExpanded ? 0 : hysteresis);

    const fits = !grid.collides(boxFor(candidate, candidate.expandedWidth, testPadding));

    // A caixa registrada usa sempre o padding normal: a histerese é um critério
    // de decisão deste badge, não um espaço que ele realmente ocupa.
    modes[candidate.key] = fits ? EXPANDED : COMPACT;
    grid.insert(boxFor(candidate, fits ? candidate.expandedWidth : candidate.compactWidth, padding));
  }

  for (const candidate of candidates) {
    if (!(candidate.key in modes)) {
      modes[candidate.key] = previous[candidate.key] ?? EXPANDED;
    }
  }

  return modes;
};
