// Testes de comportamento do resolvedor de colisão dos badges do globo.
//
// Vale transpilar o ESM na hora: é geometria pura, e a alternativa (afirmar
// coisas sobre o texto do arquivo, como source-invariants faz) não pegaria
// nenhum dos erros que importam aqui.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const { resolveBadgeModes, EXPANDED, COMPACT } = loadEsm('src/components/map/badgeCollision.js');

const HEIGHT = 29;
const EXPANDED_WIDTH = 100;
const COMPACT_WIDTH = 38;

const badge = (key, x, y, overrides = {}) => ({
  key,
  x,
  y,
  visible: true,
  expandedWidth: EXPANDED_WIDTH,
  compactWidth: COMPACT_WIDTH,
  height: HEIGHT,
  area: 0,
  ...overrides,
});

test('badges longe um do outro ficam os dois escritos', () => {
  const modes = resolveBadgeModes([badge('AAA', 0, 0), badge('BBB', 400, 0)]);

  assert.equal(modes.AAA, EXPANDED);
  assert.equal(modes.BBB, EXPANDED);
});

test('badge que colide colapsa para pill em vez de sumir', () => {
  const modes = resolveBadgeModes([
    badge('AAA', 0, 0, { area: 10 }),
    badge('BBB', 50, 0, { area: 5 }),
  ]);

  assert.equal(modes.AAA, EXPANDED);
  assert.equal(modes.BBB, COMPACT);
});

test('nenhum país some, nem com todos empilhados no mesmo pixel', () => {
  const candidates = Array.from({ length: 250 }, (_, index) =>
    badge(`C${String(index).padStart(3, '0')}`, 500, 300, { area: index })
  );

  const modes = resolveBadgeModes(candidates);

  assert.equal(Object.keys(modes).length, 250);
  for (const candidate of candidates) {
    assert.ok(
      modes[candidate.key] === EXPANDED || modes[candidate.key] === COMPACT,
      `${candidate.key} ficou sem estado`
    );
  }
  // Só o de maior prioridade fica escrito; o resto vira pill, e nada é descartado.
  const expanded = Object.values(modes).filter((mode) => mode === EXPANDED);
  assert.equal(expanded.length, 1);
});

test('país maior ganha o rótulo escrito, independente da ordem da lista', () => {
  const small = badge('SML', 50, 0, { area: 1 });
  const large = badge('LRG', 0, 0, { area: 100 });

  const forward = resolveBadgeModes([small, large]);
  const reversed = resolveBadgeModes([large, small]);

  assert.deepEqual(forward, reversed);
  assert.equal(forward.LRG, EXPANDED);
  assert.equal(forward.SML, COMPACT);
});

test('a decisão não depende da ordem em que a lista chega', () => {
  const candidates = Array.from({ length: 60 }, (_, index) =>
    badge(`C${index}`, (index % 10) * 45, Math.floor(index / 10) * 20, { area: index })
  );

  const shuffled = [...candidates].reverse();

  assert.deepEqual(resolveBadgeModes(candidates), resolveBadgeModes(shuffled));
});

test('a histerese cria uma banda morta que impede o badge de piscar', () => {
  // Nesta distância cabe um badge que JÁ estava escrito, mas não é folga
  // suficiente para um pill decidir abrir. Sem essa banda, um arrasto lento faz
  // o mesmo badge alternar de estado a cada quadro.
  const candidates = [badge('AAA', 0, 0, { area: 10 }), badge('BBB', 110, 0, { area: 5 })];

  const stayingExpanded = resolveBadgeModes(candidates, {
    previous: { AAA: EXPANDED, BBB: EXPANDED },
  });
  const stayingCompact = resolveBadgeModes(candidates, {
    previous: { AAA: EXPANDED, BBB: COMPACT },
  });

  assert.equal(stayingExpanded.BBB, EXPANDED);
  assert.equal(stayingCompact.BBB, COMPACT);
});

test('aproximar o zoom reabre os badges que estavam compactos', () => {
  const closeUp = [badge('AAA', 0, 0, { area: 10 }), badge('BBB', 60, 0, { area: 5 })];
  const collapsed = resolveBadgeModes(closeUp);
  assert.equal(collapsed.BBB, COMPACT);

  // Mesmo par depois de um zoom que multiplicou a distância na tela por 5.
  const zoomedIn = [badge('AAA', 0, 0, { area: 10 }), badge('BBB', 300, 0, { area: 5 })];
  const reopened = resolveBadgeModes(zoomedIn, { previous: collapsed });

  assert.equal(reopened.AAA, EXPANDED);
  assert.equal(reopened.BBB, EXPANDED);
});

test('badge escondido atrás do globo mantém o estado e não empurra os visíveis', () => {
  const modes = resolveBadgeModes(
    [
      badge('HID', 0, 0, { visible: false, area: 100 }),
      badge('VIS', 10, 0, { area: 1 }),
    ],
    { previous: { HID: COMPACT } }
  );

  // O invisível guardou o estado anterior...
  assert.equal(modes.HID, COMPACT);
  // ...e não roubou o espaço do visível, que segue escrito.
  assert.equal(modes.VIS, EXPANDED);
});

test('candidato com coordenada inválida não derruba o cálculo', () => {
  const modes = resolveBadgeModes([
    badge('BAD', Number.NaN, Number.NaN),
    badge('OKA', 0, 0),
  ]);

  assert.equal(Object.keys(modes).length, 2);
  assert.equal(modes.OKA, EXPANDED);
  assert.ok(modes.BAD);
});

test('o grid espacial dá o mesmo resultado que a comparação de todos contra todos', () => {
  // Referência ingênua: mesma regra, sem grid. Se as duas divergirem, o
  // particionamento em células está deixando passar alguma sobreposição.
  const naive = (candidates) => {
    const modes = {};
    const occupied = [];
    const box = (candidate, width, padding) => ({
      left: candidate.x - width / 2 - padding,
      right: candidate.x + width / 2 + padding,
      top: candidate.y - candidate.height - padding,
      bottom: candidate.y + padding,
    });
    const hits = (a, b) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    for (const candidate of [...candidates].sort((a, b) => b.area - a.area)) {
      const test = box(candidate, candidate.expandedWidth, 3);
      const fits = !occupied.some((other) => hits(other, test));
      modes[candidate.key] = fits ? EXPANDED : COMPACT;
      occupied.push(box(candidate, fits ? candidate.expandedWidth : candidate.compactWidth, 3));
    }
    return modes;
  };

  // Determinístico de propósito: um seed fixo dá um caso reproduzível se falhar.
  let seed = 42;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const candidates = Array.from({ length: 300 }, (_, index) =>
    badge(`C${String(index).padStart(3, '0')}`, random() * 1200, random() * 800, {
      area: index,
      expandedWidth: 60 + random() * 120,
    })
  );

  // Sem `previous`, tudo entra como "estava expandido" e a histerese fica fora
  // do caminho — é a comparação justa contra a referência.
  assert.deepEqual(resolveBadgeModes(candidates), naive(candidates));
});
