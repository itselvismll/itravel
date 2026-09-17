// Agrupa as paradas do roteiro que se encostam na tela.
//
// O PROBLEMA: os pinos têm tamanho fixo em pixels e o mundo não. Um roteiro pelos
// Bálcãs, visto no zoom do continente, coloca seis capitais dentro de um
// quadrado de 40px — os discos numerados se sobrepõem e viram uma mancha onde
// não dá para distinguir o dia 2 do dia 5.
//
// A SOLUÇÃO NÃO É O CLUSTER DO MAPLIBRE. A source GeoJSON do MapLibre GL JS sabe
// agrupar sozinha (`cluster: true`), e seria menos código — mas esse cálculo
// mora no worker DELE. Aqui a regra é pura: recebe as features, recebe uma
// função de projeção, devolve as features agrupadas. Quem projeta é o renderer
// (no web, `map.project`), e é só isso que muda entre o globo web, o DOM
// Component do iOS/Android e qualquer mapa nativo que venha depois.
//
// Precedente na casa: badgeCollision.js resolve a colisão dos badges de país
// exatamente assim — geometria em espaço de pixels, projeção injetada, zero DOM.
//
// Efeito colateral bem-vindo: como o agrupamento acontece DEPOIS do filtro de
// dia (a lista que entra aqui já vem filtrada), o contador do badge nunca conta
// parada de um dia que está escondido. Com o cluster da source isso seria um bug
// difícil: lá o agrupamento acontece antes de qualquer filtro de layer.
import { dayColor } from './planRoute';

/**
 * Distância máxima, em pixels, para duas paradas entrarem no mesmo grupo.
 *
 * O disco do pino tem raio 13px no zoom de cidade e o halo 16,5px
 * (planRoute.js): dois centros a menos de ~34px já se tocam. 44 agrupa um pouco
 * antes de encostar, que é quando a leitura começa a sofrer — e não tão cedo a
 * ponto de esconder paradas que ainda dava para distinguir.
 */
export const CLUSTER_RADIUS_PX = 44;

/** Lado da célula do grid de busca. Igual ao raio: um candidato a menos de
 * `raio` de distância está, no máximo, na célula vizinha. */
const CELL_SIZE = CLUSTER_RADIUS_PX;

/**
 * Cor do badge de um grupo que mistura dias.
 *
 * Vidro escuro, a mesma superfície dos outros controles do globo. Pintar o grupo
 * com a cor de um dos dias seria mentir: o badge que junta o dia 2 e o dia 5 não
 * pertence a nenhum dos dois.
 */
export const MIXED_CLUSTER_COLOR = '#0D1326';

const cellKey = (x, y) => `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}`;

/**
 * Índice espacial das paradas ainda não agrupadas.
 *
 * A versão ingênua compara cada parada com todas as outras — O(n²) a cada quadro
 * de arrasto. O grid limita a busca às nove células em volta.
 */
const createGrid = (entries) => {
  /** @type {Map<string, any[]>} */
  const cells = new Map();

  for (const entry of entries) {
    const key = cellKey(entry.x, entry.y);
    const bucket = cells.get(key);
    if (bucket) bucket.push(entry);
    else cells.set(key, [entry]);
  }

  /** Vizinhos a menos de `radius` do ponto, ainda não tomados. */
  const near = (entry, radius) => {
    const found = [];
    const minX = Math.floor((entry.x - radius) / CELL_SIZE);
    const maxX = Math.floor((entry.x + radius) / CELL_SIZE);
    const minY = Math.floor((entry.y - radius) / CELL_SIZE);
    const maxY = Math.floor((entry.y + radius) / CELL_SIZE);

    for (let cx = minX; cx <= maxX; cx += 1) {
      for (let cy = minY; cy <= maxY; cy += 1) {
        for (const candidate of cells.get(`${cx}:${cy}`) ?? []) {
          if (candidate.taken || candidate === entry) continue;
          const dx = candidate.x - entry.x;
          const dy = candidate.y - entry.y;
          if (dx * dx + dy * dy <= radius * radius) found.push(candidate);
        }
      }
    }

    return found;
  };

  return { near };
};

/**
 * Cor do grupo: a do dia, quando o grupo inteiro é do mesmo dia.
 *
 * Um grupo de três paradas do dia 2 ainda É o dia 2 — apagar essa informação
 * custaria mais do que o agrupamento resolve.
 */
const clusterColor = (days) =>
  (days.length === 1 ? dayColor(days[0]) : MIXED_CLUSTER_COLOR);

/**
 * Junta as paradas que se sobrepõem na tela.
 *
 * Guloso e determinístico: percorre as paradas na ordem em que chegaram (que é a
 * ordem do roteiro, por dia e sequência), e a primeira ainda livre vira semente
 * do grupo. Determinístico importa aqui — o cálculo roda a cada quadro de
 * arrasto, e um critério que dependesse de ordem instável faria os grupos
 * piscarem entre duas formas a cada movimento da câmera.
 *
 * O grupo é DESENHADO sobre a parada mais próxima do centro do bolo, e não sobre
 * a média das coordenadas: a média de dois pontos em lados opostos de uma baía
 * cai na água, e o badge apareceria boiando longe de qualquer parada.
 *
 * @param {{ features?: any[] }} pointData FeatureCollection de paradas
 *   (buildPlanRouteData().points), já filtrada pelo dia em foco
 * @param {(coordinates: [number, number]) => ({ x: number, y: number } | null)} project
 *   lng/lat → pixel da tela. `null` para uma parada que não está na tela (atrás
 *   do globo, por exemplo) — ela sai do cálculo, como já sai do desenho.
 * @param {{ radius?: number }} [options]
 * @returns {{ type: 'FeatureCollection', features: any[] }} as paradas soltas
 *   como vieram, mais uma feature por grupo com `cluster: true`
 */
export const clusterPlanFeatures = (pointData, project, { radius = CLUSTER_RADIUS_PX } = {}) => {
  const features = pointData?.features ?? [];

  // Sem projeção não há espaço de tela, e sem espaço de tela não existe a
  // pergunta "estes dois se sobrepõem?". Devolver tudo solto é o comportamento
  // correto: é exatamente o desenho de antes desta feature.
  if (typeof project !== 'function' || !features.length) {
    return { type: 'FeatureCollection', features: [...features] };
  }

  const entries = [];
  const offscreen = [];

  for (const feature of features) {
    const projected = project(feature?.geometry?.coordinates);
    if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      offscreen.push(feature);
      continue;
    }
    entries.push({ feature, x: projected.x, y: projected.y, taken: false });
  }

  const grid = createGrid(entries);
  const result = [...offscreen];

  for (const entry of entries) {
    if (entry.taken) continue;

    const neighbours = grid.near(entry, radius);
    if (!neighbours.length) {
      entry.taken = true;
      result.push(entry.feature);
      continue;
    }

    entry.taken = true;
    const members = [entry, ...neighbours];
    for (const member of neighbours) member.taken = true;

    const centerX = members.reduce((sum, member) => sum + member.x, 0) / members.length;
    const centerY = members.reduce((sum, member) => sum + member.y, 0) / members.length;

    let anchor = members[0];
    let best = Infinity;
    for (const member of members) {
      const distance = (member.x - centerX) ** 2 + (member.y - centerY) ** 2;
      if (distance < best) {
        best = distance;
        anchor = member;
      }
    }

    const days = [
      ...new Set(members.map((member) => Number(member.feature?.properties?.day) || 1)),
    ].sort((a, b) => a - b);

    result.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: anchor.feature.geometry.coordinates },
      properties: {
        cluster: true,
        count: members.length,
        // O rótulo é string porque `text-field` não formata número — a mesma
        // razão do `orderLabel` de uma parada solta.
        countLabel: `+${members.length}`,
        day: days.length === 1 ? days[0] : null,
        color: clusterColor(days),
        mixed: days.length > 1,
        // As paradas do grupo viajam como JSON: as properties de uma feature
        // atravessam o mapa e voltam no evento de clique já achatadas, e um array
        // de objetos voltaria como "[object Object]".
        members: JSON.stringify(
          members.map((member) => member.feature?.properties ?? {})
        ),
      },
    });
  }

  return { type: 'FeatureCollection', features: result };
};

/**
 * Desfaz o `members` de um grupo tocado.
 *
 * Fica aqui, ao lado de quem serializa, para que os dois lados da mesma decisão
 * nunca se percam de vista. Nunca lança: o que entra veio de um evento do mapa.
 *
 * @param {any} properties properties da feature do grupo
 * @returns {any[]} paradas do grupo, ou lista vazia
 */
export const clusterMembers = (properties) => {
  const raw = properties?.members;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
