// activity.period, budget.items[].category e checklist[].category viraram enum fechado
// (lote que fecha a Fase 1 do i18n): antes disso o Gemini escrevia texto livre em
// português ("manhã", "Alimentação", "Documentos"), impresso direto na tela e também
// usado em pattern-match no código (periodIcon via .includes, regex /compras/i). Isto
// bloqueava a Fase 2 (tradução), porque não tem como traduzir texto que não é chave.
//
// Este módulo é o espelho do client dos três enums que a Edge Function `travel-assistant`
// agora valida via `enum:` no response_schema. MÓDULO PURO — sem react-native, sem
// useLocale — por isso o teste roda sem montar tela.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEsm } = require('./helpers/load-esm.cjs');

const categories = loadEsm('src/utils/assistantPlanCategories.js');

const {
  ACTIVITY_PERIODS,
  normalizePeriod,
  periodIcon,
  periodLabelKey,
  BUDGET_CATEGORIES,
  normalizeBudgetCategory,
  budgetCategoryLabelKey,
  isShoppingBudgetCategory,
  CHECKLIST_CATEGORIES,
  normalizeChecklistCategory,
  checklistCategoryLabelKey,
} = categories;

test('todo valor do enum de período rotula e ilustra certo', () => {
  for (const period of ACTIVITY_PERIODS) {
    assert.equal(normalizePeriod(period), period);
    assert.match(periodLabelKey(period), /^assistantResult\.period\.\w+$/);
    assert.notEqual(periodLabelKey(period), 'assistantResult.period.outro');
    assert.ok(periodIcon(period).endsWith('-outline'), `${period} deveria ter ícone`);
  }
});

test('período salvo antes do enum (texto livre com acento) continua com ícone e rótulo certos', () => {
  // Dado de produção anterior a este lote: o prompt antigo sugeria exatamente este texto.
  assert.equal(normalizePeriod('manhã'), 'manha');
  assert.equal(normalizePeriod('Tarde'), 'tarde');
  assert.equal(normalizePeriod('NOITE'), 'noite');
  assert.equal(periodLabelKey('manhã'), 'assistantResult.period.manha');
});

test('período desconhecido ou ausente cai no genérico, sem quebrar a tela', () => {
  for (const valorInvalido of [null, undefined, '', 'madrugada', 42, {}]) {
    assert.equal(normalizePeriod(valorInvalido), null);
    assert.equal(periodLabelKey(valorInvalido), 'assistantResult.period.outro');
    assert.equal(periodIcon(valorInvalido), 'time-outline');
  }
});

test('todo valor do enum de categoria de orçamento rotula certo', () => {
  for (const categoria of BUDGET_CATEGORIES) {
    assert.equal(normalizeBudgetCategory(categoria), categoria);
    assert.match(budgetCategoryLabelKey(categoria), /^assistantResult\.budgetCategory\.\w+$/);
    assert.notEqual(budgetCategoryLabelKey(categoria), 'assistantResult.budgetCategory.outro');
  }
});

test('categoria de orçamento salva antes do enum (texto livre do prompt antigo) continua reconhecida', () => {
  assert.equal(normalizeBudgetCategory('Passagens'), 'passagens');
  assert.equal(normalizeBudgetCategory('Hospedagem'), 'hospedagem');
  assert.equal(normalizeBudgetCategory('Alimentação'), 'alimentacao');
  assert.equal(normalizeBudgetCategory('Transporte local'), 'transporte_local');
  assert.equal(normalizeBudgetCategory('Passeios e ingressos'), 'passeios_ingressos');
  assert.equal(normalizeBudgetCategory('Compras e Reserva'), 'compras_reserva');
  // Bug histórico (lote anterior): o agregador comparava com a string exata "Compras".
  assert.equal(normalizeBudgetCategory('Compras'), 'compras_reserva');
});

test('categoria de orçamento desconhecida ou ausente cai no genérico, sem quebrar a tela', () => {
  for (const valorInvalido of [null, undefined, '', 'Investimentos', 42]) {
    assert.equal(normalizeBudgetCategory(valorInvalido), null);
    assert.equal(budgetCategoryLabelKey(valorInvalido), 'assistantResult.budgetCategory.outro');
  }
});

test('isShoppingBudgetCategory substitui a regex /compras/i removida do app', () => {
  assert.equal(isShoppingBudgetCategory('compras_reserva'), true);
  assert.equal(isShoppingBudgetCategory('Compras e Reserva'), true);
  assert.equal(isShoppingBudgetCategory('Compras'), true);
  assert.equal(isShoppingBudgetCategory('alimentacao'), false);
  assert.equal(isShoppingBudgetCategory('comprasALGUMACOISA'), false, 'a regex antiga faria match parcial; o enum não');
});

test('todo valor do enum de categoria de checklist rotula certo', () => {
  for (const categoria of CHECKLIST_CATEGORIES) {
    assert.equal(normalizeChecklistCategory(categoria), categoria);
    assert.match(checklistCategoryLabelKey(categoria), /^assistantResult\.checklistCategory\.\w+$/);
    assert.notEqual(checklistCategoryLabelKey(categoria), 'assistantResult.checklistCategory.outro');
  }
});

test('categoria de checklist salva antes do enum (texto livre com acento) continua reconhecida', () => {
  assert.equal(normalizeChecklistCategory('Documentos'), 'documentos');
  assert.equal(normalizeChecklistCategory('Saúde'), 'saude');
  assert.equal(normalizeChecklistCategory('Dinheiro'), 'dinheiro');
  assert.equal(normalizeChecklistCategory('Conectividade'), 'conectividade');
  assert.equal(normalizeChecklistCategory('Bagagem'), 'bagagem');
});

test('categoria de checklist desconhecida ou ausente cai no genérico, sem quebrar a tela', () => {
  for (const valorInvalido of [null, undefined, '', 'Vacinas', 42]) {
    assert.equal(normalizeChecklistCategory(valorInvalido), null);
    assert.equal(checklistCategoryLabelKey(valorInvalido), 'assistantResult.checklistCategory.outro');
  }
});
