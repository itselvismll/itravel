// O card de nível do perfil.
//
// Duas coisas são travadas aqui: que o card não tem emoji (o layout antigo era
// 🌍/👑, que muda de desenho conforme o sistema e a fonte) e que as duas telas
// de perfil leem a MESMA fonte de níveis.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CARD = 'src/components/profile/TravelerLevelCard.js';
const TELAS = [
  'src/screens/profile/ProfileScreen.js',
  'src/screens/profile/PublicProfileScreen.js',
];

// Emoji de imagem (pictográficos). Não usa \p{Emoji} porque ele casa com dígitos
// e com '#', que aparecem em código legítimo.
const EMOJI = /\p{Extended_Pictographic}/u;

test('o card não usa emoji em lugar nenhum', () => {
  const card = stripComments(read(CARD));
  const encontrados = card.match(new RegExp(EMOJI, 'gu'));
  assert.equal(
    encontrados,
    null,
    `o card voltou a ter emoji: ${JSON.stringify(encontrados)}`
  );
});

test('a medalha e os selos são vetoriais, não texto', () => {
  const card = read(CARD);

  // Medalha: gradiente radial roxo escuro -> claro, contorno branco, anel
  // pontilhado e globo em linha.
  assert.match(card, /RadialGradient/);
  assert.match(card, /stopColor="#B79CF0"/);
  assert.match(card, /stopColor="#5B1FB8"/);
  assert.match(card, /strokeDasharray="2 3"/);
  assert.match(card, /name="globe-outline"/);

  // Os três estados do selo.
  assert.match(card, /name="star"/);            // nível atual
  assert.match(card, /name="checkmark"/);       // concluído
  assert.match(card, /name="lock-closed-outline"/); // bloqueado

  // Dourado só no nível atual.
  assert.match(card, /GOLD_LIGHT = '#F1C463'/);
  assert.match(card, /GOLD_DARK = '#C99423'/);

  // Estrela do rodapé no roxo claro pedido.
  assert.match(card, /STAR_PURPLE = '#9D6BF2'/);
});

test('as telas de perfil não desenham mais o nível por conta própria', () => {
  for (const tela of TELAS) {
    const source = read(tela);
    assert.match(source, /<TravelerLevelCard/, `${tela}: não usa o card compartilhado`);
    // O emoji do nível saiu das duas telas.
    assert.doesNotMatch(stripComments(source), /levelInfo\.current\.icon|level\.emoji/);
  }
});

test('as duas telas leem a mesma fonte de níveis', () => {
  // O perfil público tinha uma CÓPIA da lista, com limites diferentes: o mesmo
  // usuário com 5 países aparecia como "Explorador" no próprio perfil e
  // "Viajante" no público.
  for (const tela of TELAS) {
    const source = stripComments(read(tela));
    assert.match(source, /getLevelInfo/, `${tela}: não usa getLevelInfo`);
    assert.doesNotMatch(
      source,
      /const LEVELS = \[/,
      `${tela}: voltou a ter uma lista de níveis própria`
    );
  }
});

test('a trilha mostra os 5 níveis reais do app', () => {
  // O card itera TRAVELER_LEVELS, então a trilha acompanha a lista real — e são
  // cinco, não três.
  const niveis = loadEsm('src/utils/travelerLevels.js', {});
  assert.equal(niveis.TRAVELER_LEVELS.length, 5);
  assert.deepEqual(
    niveis.TRAVELER_LEVELS.map((n) => n.name),
    ['Iniciante', 'Viajante', 'Explorador', 'Globetrotter', 'Lenda Viajante']
  );

  const card = read(CARD);
  assert.match(card, /TRAVELER_LEVELS\.map\(/, 'a trilha não itera a lista real');
  // Nada de nome de nível escrito à mão no card.
  for (const nome of niveis.TRAVELER_LEVELS.map((n) => n.name)) {
    assert.doesNotMatch(stripComments(card), new RegExp(`'${nome}'`), `${nome} está hardcoded`);
  }
});

test('a barra de progresso foi mantida', () => {
  const card = read(CARD);
  assert.match(card, /progressFill.*width: `\$\{Math\.round\(levelInfo\.progress \* 100\)\}%`/s);
  assert.match(card, /backgroundColor: PURPLE, borderRadius: 3/);
});
