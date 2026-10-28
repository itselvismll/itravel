// A identidade visual de um participante: iniciais e gradiente.
//
// POR QUE ISTO MERECE TESTE
//
// Porque a promessa do gradiente por pessoa é ESTABILIDADE, e estabilidade é
// exatamente o que não se enxerga olhando a tela uma vez. Um avatar bonito que
// muda de cor entre dois carregamentos passa na revisão visual e destrói a
// razão de ele existir — o participante deixa de ser reconhecível de relance e
// vira ruído colorido.
//
// E porque as iniciais têm um caso que a prancheta não mostra: nome brasileiro
// com partícula. "Maria da Silva" precisa dar "MS"; se der "MD", duas pessoas
// diferentes viram o mesmo círculo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const {
  initialsFrom,
  avatarIdentity,
  AVATAR_GRADIENTS,
  OWNER_GRADIENT,
  GRADIENT_DIRECTION,
} = loadEsm('src/utils/memberAvatar.js');

test('duas palavras viram duas iniciais', () => {
  assert.equal(initialsFrom('Mariana Freitas'), 'MF');
  assert.equal(initialsFrom('Marcos Souza'), 'MS');
});

test('uma palavra vira as duas primeiras letras, nunca uma só', () => {
  // Uma letra sozinha num círculo de 46px deixa "Mariana" e "Marcos"
  // indistinguíveis.
  assert.equal(initialsFrom('Mariana'), 'MA');
  assert.equal(initialsFrom('bruno'), 'BR');
});

test('partícula do português não vira inicial', () => {
  assert.equal(initialsFrom('Maria da Silva'), 'MS');
  assert.equal(initialsFrom('João de Souza Lima'), 'JL');
  assert.equal(initialsFrom('Ana e Costa'), 'AC');
});

test('mais de duas palavras usa a primeira e a última', () => {
  assert.equal(initialsFrom('Ana Paula Ribeiro'), 'AR');
});

test('acento e caixa são normalizados', () => {
  assert.equal(initialsFrom('ângela érica'), 'ÂÉ');
});

test('pontuação e emoji não entram nas iniciais', () => {
  // Username colado no lugar do nome, e nome com emoji: acontece.
  assert.equal(initialsFrom('@marifreitas'), 'MA');
  assert.equal(initialsFrom('Mariana 🌍 Freitas'), 'MF');
});

test('sem nome aproveitável sai o fallback', () => {
  assert.equal(initialsFrom(''), '?');
  assert.equal(initialsFrom(null), '?');
  assert.equal(initialsFrom('   '), '?');
  assert.equal(initialsFrom('🌍'), '?');
  assert.equal(initialsFrom('', '··'), '··');
});

test('o gradiente é estável para a mesma pessoa', () => {
  const pessoa = { id: 'a3f1e2d4-0000-4000-8000-000000000001', display_name: 'Mariana Freitas' };

  const primeira = avatarIdentity(pessoa);
  for (let i = 0; i < 50; i += 1) {
    assert.deepEqual(avatarIdentity(pessoa).gradient, primeira.gradient);
  }
});

test('o gradiente segue o id, não o nome', () => {
  // A pessoa edita o perfil; a cor dela não pode mudar por causa disso.
  const antes = avatarIdentity({ id: 'mesmo-id', display_name: 'Mariana Freitas' });
  const depois = avatarIdentity({ id: 'mesmo-id', display_name: 'Mari F.' });

  assert.deepEqual(antes.gradient, depois.gradient);
});

test('pessoas diferentes com o mesmo nome têm cores próprias', () => {
  const a = avatarIdentity({ id: 'id-um', display_name: 'Ana Silva' });
  const b = avatarIdentity({ id: 'id-dois', display_name: 'Ana Silva' });

  assert.equal(a.initials, b.initials);
  assert.notDeepEqual(a.gradient, b.gradient);
});

test('sem id, o username serve de chave estável', () => {
  const a = avatarIdentity({ username: 'marifreitas', display_name: 'Mariana Freitas' });
  const b = avatarIdentity({ username: 'marifreitas', display_name: 'Mariana Freitas' });

  assert.deepEqual(a.gradient, b.gradient);
});

test('organizador tem o gradiente da marca, fora do rodízio', () => {
  const dono = avatarIdentity({ id: 'qualquer', display_name: 'Elvis Misael', role: 'owner' });

  assert.equal(dono.isOwner, true);
  assert.deepEqual(dono.gradient, OWNER_GRADIENT);
  // E o roxo do dono não colide com nenhum dos quatro do rodízio, senão o selo
  // dourado seria o único sinal e a cor deixaria de distinguir.
  for (const gradiente of AVATAR_GRADIENTS) {
    assert.notEqual(gradiente.from, OWNER_GRADIENT.from);
  }
});

test('quem não é dono nunca recebe o gradiente do dono', () => {
  for (let i = 0; i < 400; i += 1) {
    const { gradient } = avatarIdentity({ id: `pessoa-${i}`, display_name: `Fulano ${i}` });
    assert.notDeepEqual(gradient, OWNER_GRADIENT);
  }
});

test('o rodízio usa os quatro gradientes, sem favorecer um', () => {
  const contagem = new Map(AVATAR_GRADIENTS.map((g) => [g.from, 0]));

  for (let i = 0; i < 400; i += 1) {
    const { gradient } = avatarIdentity({ id: `uuid-de-teste-${i}` });
    contagem.set(gradient.from, contagem.get(gradient.from) + 1);
  }

  // Todos aparecem, e nenhum leva mais da metade. Um hash enviesado deixaria
  // metade da lista da mesma cor — que é o problema que o rodízio resolve.
  for (const [, vezes] of contagem) {
    assert.ok(vezes > 0, 'todo gradiente do rodízio precisa ser alcançável');
    assert.ok(vezes < 200, 'nenhum gradiente pode dominar o rodízio');
  }
});

test('entrada vazia não quebra e ainda devolve algo pintável', () => {
  for (const entrada of [null, undefined, {}, { id: null }]) {
    const identidade = avatarIdentity(entrada);
    assert.equal(typeof identidade.initials, 'string');
    assert.ok(identidade.initials.length >= 1);
    assert.ok(identidade.gradient.from.startsWith('#'));
    assert.ok(identidade.gradient.to.startsWith('#'));
  }
});

test('a direção é diagonal, não vertical nem horizontal', () => {
  // O mockup pede `linear-gradient(155deg)`. Se start e end dividirem um eixo, o
  // gradiente vira uma faixa reta e o círculo perde o volume.
  const { start, end } = GRADIENT_DIRECTION;
  assert.notEqual(start.x, end.x);
  assert.notEqual(start.y, end.y);
});
