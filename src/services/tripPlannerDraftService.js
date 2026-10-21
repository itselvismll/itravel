const STORAGE_KEY = 'journi.tripPlannerDraft';
let memoryDraft = null;

const readStorage = () => {
  if (typeof globalThis.localStorage === 'undefined') return memoryDraft;
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : memoryDraft;
  } catch {
    return memoryDraft;
  }
};

const writeStorage = draft => {
  memoryDraft = draft;
  if (typeof globalThis.localStorage === 'undefined') return;
  try {
    if (draft) globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    else globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // O rascunho continua disponível em memória nesta execução do app.
  }
};

export const getTripPlannerDraft = () => readStorage();

export const saveTripPlannerFormDraft = form => {
  const hasContent = Boolean(
    String(form?.origin || '').trim()
    || form?.destinations?.length
    || String(form?.startDate || '').trim()
    || String(form?.notes || '').trim()
  );
  if (!hasContent) return;
  writeStorage({
    type: 'form',
    form,
    updatedAt: new Date().toISOString(),
  });
};

export const saveTripPlannerResultDraft = ({ request, plan, userContext, activeTab }) => {
  if (!plan?.days?.length) return;
  writeStorage({
    type: 'result',
    request,
    plan,
    userContext,
    activeTab: activeTab || 'itinerary',
    updatedAt: new Date().toISOString(),
  });
};

export const clearTripPlannerDraft = () => writeStorage(null);
