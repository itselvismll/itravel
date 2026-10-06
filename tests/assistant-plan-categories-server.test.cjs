// Lado da Edge Function do enum fechado de activity.period, budget.items[].category e
// checklist[].category — o espelho puro no client está em
// tests/assistant-plan-categories.test.cjs. Aqui cobrimos: o schema e o prompt exigem o
// enum (não só documentam ele), as funções de normalização aceitam dado salvo antes do
// enum sem quebrar, e o bug histórico da comparação exata `=== 'Compras'` saiu do código.
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const FUNCTION_PATH = 'supabase/functions/travel-assistant/index.ts';

const ACTIVITY_PERIODS = ['manha', 'tarde', 'noite'];
const BUDGET_CATEGORIES = [
  'passagens', 'hospedagem', 'alimentacao', 'transporte_local', 'passeios_ingressos', 'compras_reserva',
];
const CHECKLIST_CATEGORIES = ['documentos', 'saude', 'dinheiro', 'conectividade', 'bagagem'];

// Mesmo carregador de tests/plan-geography.test.cjs: transpila o TypeScript da Edge
// Function (Deno) e injeta os globais que ela espera para rodar em processo, sem servidor.
const loadEdgeFunction = () => {
  const filename = path.join(root, FUNCTION_PATH);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    presets: [['@babel/preset-typescript', { onlyRemoveTypeImports: false }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });

  const factory = vm.runInThisContext(
    `(function (exports, module, require, Deno, fetch) {\n${code}\n})`,
    { filename }
  );
  const loaded = { exports: {} };
  factory(
    loaded.exports,
    loaded,
    (specifier) => {
      if (specifier.includes('deno.land')) return { serve: () => {} };
      throw new Error(`dependência não fornecida: ${specifier}`);
    },
    { env: { get: () => '' } },
    async () => { throw new Error('rede não esperada') }
  );
  return loaded.exports;
};

const handlerSource = fs.readFileSync(path.join(root, FUNCTION_PATH), 'utf8');

test('schema exige enum fechado nos três campos, igual já é feito em activity.category', () => {
  assert.match(handlerSource, /period: \{ type: 'STRING', enum: \[\.\.\.ACTIVITY_PERIODS\] \}/);
  assert.match(handlerSource, /category: \{ type: 'STRING', enum: \[\.\.\.BUDGET_CATEGORIES\] \}/);
  assert.match(handlerSource, /category: \{ type: 'STRING', enum: \[\.\.\.CHECKLIST_CATEGORIES\] \}/);
  for (const valor of [...ACTIVITY_PERIODS, ...BUDGET_CATEGORIES, ...CHECKLIST_CATEGORIES]) {
    assert.ok(handlerSource.includes(`'${valor}'`), `enum precisa conter ${valor}`);
  }
});

test('prompt instrui o enum explicitamente para os três campos, não só o schema', () => {
  assert.match(handlerSource, /period deve ser exatamente um destes valores: \$\{ACTIVITY_PERIODS\.join/);
  assert.match(handlerSource, /category deve ser exatamente um destes valores: \$\{BUDGET_CATEGORIES\.join/);
  assert.match(handlerSource, /category deve ser exatamente um destes valores: \$\{CHECKLIST_CATEGORIES\.join/);
});

test('o exemplo de JSON do prompt usa os códigos do enum, não o texto livre antigo', () => {
  assert.doesNotMatch(handlerSource, /"period":"manhã"/);
  assert.doesNotMatch(handlerSource, /"category":"Alimentação"/);
  assert.doesNotMatch(handlerSource, /"category":"Documentos"/);
  assert.match(handlerSource, /"period":"manha"/);
  assert.match(handlerSource, /"category":"alimentacao"/);
  assert.match(handlerSource, /"category":"documentos"/);
});

test('a comparação exata contra a string "Compras" saiu do código', () => {
  assert.doesNotMatch(handlerSource, /item\.category === 'Compras'/);
  assert.match(handlerSource, /item\.category === 'compras_reserva'/);
});

test('normalizePeriod aceita o enum e o texto livre salvo antes dele, sem quebrar em dado desconhecido', () => {
  const { normalizePeriod } = loadEdgeFunction();
  for (const period of ACTIVITY_PERIODS) {
    assert.equal(normalizePeriod(period), period);
  }
  // Dado de produção anterior ao enum: o prompt antigo sugeria exatamente este texto.
  assert.equal(normalizePeriod('manhã'), 'manha');
  assert.equal(normalizePeriod('NOITE'), 'noite');
  // Sem quebrar a tela: cai num fallback válido, nunca undefined/null/texto cru.
  assert.equal(normalizePeriod(null), 'tarde');
  assert.equal(normalizePeriod('madrugada'), 'tarde');
  assert.ok(ACTIVITY_PERIODS.includes(normalizePeriod(undefined)));
});

test('normalizeBudgetCategory aceita o enum e o texto livre do prompt antigo, sem quebrar em dado desconhecido', () => {
  const { normalizeBudgetCategory } = loadEdgeFunction();
  for (const categoria of BUDGET_CATEGORIES) {
    assert.equal(normalizeBudgetCategory(categoria), categoria);
  }
  assert.equal(normalizeBudgetCategory('Alimentação'), 'alimentacao');
  assert.equal(normalizeBudgetCategory('Transporte local'), 'transporte_local');
  assert.equal(normalizeBudgetCategory('Compras e Reserva'), 'compras_reserva');
  // O bug histórico: a string exata "Compras", sem "e Reserva".
  assert.equal(normalizeBudgetCategory('Compras'), 'compras_reserva');
  assert.ok(BUDGET_CATEGORIES.includes(normalizeBudgetCategory('categoria inventada')));
});

test('normalizeChecklistCategory aceita o enum e o texto livre salvo antes dele, sem quebrar em dado desconhecido', () => {
  const { normalizeChecklistCategory } = loadEdgeFunction();
  for (const categoria of CHECKLIST_CATEGORIES) {
    assert.equal(normalizeChecklistCategory(categoria), categoria);
  }
  assert.equal(normalizeChecklistCategory('Saúde'), 'saude');
  assert.equal(normalizeChecklistCategory('Documentos'), 'documentos');
  assert.ok(CHECKLIST_CATEGORIES.includes(normalizeChecklistCategory('categoria inventada')));
});
