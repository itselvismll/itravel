// Regra de username: o app (src/utils/username.js) e o banco
// (public.normalize_username, migração 20260824140000) precisam concordar.
// Os casos abaixo são os mesmos rodados no SQL Editor contra a função SQL.
const test = require('node:test');
const assert = require('node:assert');

// src/utils/username.js é ESM; o runner aqui é CJS. Em vez de arrastar um
// transpilador para um arquivo de 40 linhas, lemos a fonte e avaliamos as duas
// funções puras — o que também garante que o teste falhe se o arquivo sumir.
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'utils', 'username.js'),
  'utf8'
);
const moduleBody = source.replace(/^export /gm, '');
// eslint-disable-next-line no-new-func
const { normalizeUsername, validateUsername, USERNAME_PATTERN } = new Function(
  `${moduleBody}\nreturn { normalizeUsername, validateUsername, USERNAME_PATTERN };`
)();

test('normaliza nome do Google para username válido', () => {
  assert.strictEqual(normalizeUsername('Matheus Lima Peres'), 'matheuslim');
  assert.strictEqual(normalizeUsername('José Antônio da Silva'), 'joseantoni');
  assert.strictEqual(normalizeUsername('Ana'), 'ana');
});

test('remove acento, maiúscula, espaço e pontuação', () => {
  assert.strictEqual(normalizeUsername('Matheus'), 'matheus');
  assert.strictEqual(normalizeUsername('  ana  paula '), 'anapaula');
  assert.strictEqual(normalizeUsername('a.b-c!d@e'), 'abcde');
  assert.strictEqual(normalizeUsername('çãõéü'), 'caoeu');
  assert.strictEqual(normalizeUsername('under_score'), 'under_scor');
});

test('trunca em 10 caracteres', () => {
  assert.strictEqual(normalizeUsername('abcdefghijklmnop').length, 10);
});

test('entrada sem nada aproveitável vira string vazia', () => {
  assert.strictEqual(normalizeUsername('李雷'), '');
  assert.strictEqual(normalizeUsername('   '), '');
  assert.strictEqual(normalizeUsername(null), '');
  assert.strictEqual(normalizeUsername(undefined), '');
});

test('validateUsername aceita o que casa com o padrão', () => {
  for (const ok of ['ana', 'matheuslim', 'a_b_c', 'user123', '___']) {
    const result = validateUsername(ok);
    assert.strictEqual(result.valid, true, `${ok} deveria ser válido`);
    assert.strictEqual(result.error, null);
    assert.match(result.value, USERNAME_PATTERN);
  }
});

test('validateUsername rejeita vazio e curto demais', () => {
  assert.strictEqual(validateUsername('').valid, false);
  assert.strictEqual(validateUsername('   ').valid, false);
  assert.strictEqual(validateUsername('李雷').valid, false);
  assert.strictEqual(validateUsername('ab').valid, false);
  assert.match(validateUsername('ab').error, /3 caracteres/);
});

test('validateUsername devolve o valor normalizado, não o cru', () => {
  const result = validateUsername('Matheus Lima Peres');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.value, 'matheuslim');
});

test('nada que passe na validação viola o padrão do banco', () => {
  const amostras = ['Matheus Lima Peres', 'José', 'a b c', 'ABC', '___', 'x9'];
  for (const bruto of amostras) {
    const { valid, value } = validateUsername(bruto);
    if (valid) assert.match(value, /^[a-z0-9_]{3,10}$/);
  }
});
