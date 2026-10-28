// Os três campos que o Gemini preenchia como texto livre em português —
// activity.period, budget.items[].category e checklist[].category — viraram
// enum fechado na Edge Function `travel-assistant`. Sem isso, a Fase 2 do i18n
// (tradução pra inglês/espanhol) mostraria "manhã" e "Alimentação" soltos no
// meio de um roteiro já traduzido.
//
// MESMO PADRÃO de CATEGORY_ICON em components/map/planRoute.js e de
// PLACE_CATEGORIES em utils/planGeography.js: o valor que chega do servidor é
// só uma CHAVE; ícone e rótulo (via i18n) são resolvidos aqui, com fallback
// genérico. Os enums abaixo precisam bater com os mesmos arrays declarados em
// supabase/functions/travel-assistant/index.ts — não há import entre os dois
// lados porque um roda em Deno e o outro no bundle do app.
//
// FALLBACK PARA DADO LEGADO: antes do enum, estes três campos eram o texto
// solto que o prompt já sugeria — "manhã"/"tarde"/"noite" (reduz ao próprio
// código ao tirar o acento), e "Alimentação", "Transporte local", "Passeios e
// ingressos", "Compras e Reserva", "Documentos", "Saúde", "Dinheiro",
// "Conectividade", "Bagagem" para orçamento/checklist. Os aliases abaixo
// cobrem exatamente esse texto, para um roteiro salvo antes desta mudança
// continuar com ícone e rótulo certos em vez de cair sempre no genérico. Não é
// migração de dado — é só a LEITURA reconhecendo o que já está no banco.
//
// MÓDULO PURO: sem react-native, sem useLocale. Quem renderiza resolve a
// chave de tradução que as funções abaixo devolvem.

const stripAccents = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

// ── Período da atividade ─────────────────────────────────────────────────

export const ACTIVITY_PERIODS = ['manha', 'tarde', 'noite'];

const PERIOD_ICON = {
  manha: 'sunny-outline',
  tarde: 'partly-sunny-outline',
  noite: 'moon-outline',
};

const PERIOD_LABEL_KEY = {
  manha: 'assistantResult.period.manha',
  tarde: 'assistantResult.period.tarde',
  noite: 'assistantResult.period.noite',
};

/** @returns {string|null} o código do enum, ou null quando não bate com nada conhecido */
export const normalizePeriod = (value) => {
  const normalized = stripAccents(value);
  return ACTIVITY_PERIODS.includes(normalized) ? normalized : null;
};

export const periodIcon = (value) => PERIOD_ICON[normalizePeriod(value)] || 'time-outline';

export const periodLabelKey = (value) => PERIOD_LABEL_KEY[normalizePeriod(value)] || 'assistantResult.period.outro';

// ── Categoria do item de orçamento ───────────────────────────────────────

export const BUDGET_CATEGORIES = [
  'passagens', 'hospedagem', 'alimentacao', 'transporte_local', 'passeios_ingressos', 'compras_reserva',
];

const BUDGET_CATEGORY_LABEL_KEY = {
  passagens: 'assistantResult.budgetCategory.passagens',
  hospedagem: 'assistantResult.budgetCategory.hospedagem',
  alimentacao: 'assistantResult.budgetCategory.alimentacao',
  transporte_local: 'assistantResult.budgetCategory.transporteLocal',
  passeios_ingressos: 'assistantResult.budgetCategory.passeiosIngressos',
  compras_reserva: 'assistantResult.budgetCategory.comprasReserva',
};

// Só os nomes de categoria com mais de uma palavra precisam de alias: o texto
// antigo usava espaço ("Transporte local"), o código usa underscore. O resto
// ("Alimentação" -> "alimentacao") já bate direto ao tirar o acento.
const LEGACY_BUDGET_CATEGORY_ALIASES = {
  'transporte local': 'transporte_local',
  'passeios e ingressos': 'passeios_ingressos',
  'compras e reserva': 'compras_reserva',
  // Bug histórico: o agregador da Edge Function comparava com a string exata
  // "Compras" (sem "e Reserva"), então uma parcela do dado salvo tem só isto.
  compras: 'compras_reserva',
};

export const normalizeBudgetCategory = (value) => {
  const normalized = stripAccents(value);
  if (BUDGET_CATEGORIES.includes(normalized)) return normalized;
  return LEGACY_BUDGET_CATEGORY_ALIASES[normalized] || null;
};

export const budgetCategoryLabelKey = (value) => (
  BUDGET_CATEGORY_LABEL_KEY[normalizeBudgetCategory(value)] || 'assistantResult.budgetCategory.outro'
);

export const isShoppingBudgetCategory = (value) => normalizeBudgetCategory(value) === 'compras_reserva';

// ── Categoria do item da checklist ───────────────────────────────────────

export const CHECKLIST_CATEGORIES = ['documentos', 'saude', 'dinheiro', 'conectividade', 'bagagem'];

const CHECKLIST_CATEGORY_LABEL_KEY = {
  documentos: 'assistantResult.checklistCategory.documentos',
  saude: 'assistantResult.checklistCategory.saude',
  dinheiro: 'assistantResult.checklistCategory.dinheiro',
  conectividade: 'assistantResult.checklistCategory.conectividade',
  bagagem: 'assistantResult.checklistCategory.bagagem',
};

export const normalizeChecklistCategory = (value) => {
  const normalized = stripAccents(value);
  return CHECKLIST_CATEGORIES.includes(normalized) ? normalized : null;
};

export const checklistCategoryLabelKey = (value) => (
  CHECKLIST_CATEGORY_LABEL_KEY[normalizeChecklistCategory(value)] || 'assistantResult.checklistCategory.outro'
);
