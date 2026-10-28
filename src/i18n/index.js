// O idioma do app: detecção, escolha manual, e a função `t`.
//
// POR QUE i18n-js, E NÃO react-i18next
//
// A decisão saiu de medir o código, não de preferência. O que existe hoje em
// `src/`: ~650 strings de interface, 88 com interpolação, 13 lugares com plural,
// e DUAS frases com `<Text>` aninhado no meio (`TripInviteScreen` e
// `DestinationBudgetPlanner`). O `<Trans>` do react-i18next existe justamente
// para esse último caso — texto com marcação no meio da frase —, e por duas
// ocorrências ele não se paga: as duas viram duas ou três chaves, que é um padrão
// conhecido e que o tradutor entende.
//
// O que o react-i18next traria além disso (namespaces com carregamento sob
// demanda, Suspense, formatadores embutidos) resolve problemas que este app não
// tem: os arquivos somados dão poucas dezenas de KB e vão no bundle, não há
// tradução vinda de rede, e data/número já ficam centralizados em
// `utils/formatDate` e `utils/formatNumber`.
//
// O que o i18n-js NÃO dá de graça é o re-render ao trocar de idioma — ele não
// conhece React. Isso custa um contexto, que é o `LocaleProvider` ao lado. Trinta
// linhas, uma vez, contra uma dependência maior para sempre.
//
// Se um dia aparecer texto rico em quantidade (termos de uso dentro do app,
// e-mails transacionais renderizados no cliente), a conta muda e vale revisitar.
//
// ─────────────────────────────────────────────────────────────────────────────
//
// FALLBACK É PORTUGUÊS, SEMPRE. `en.json` e `es.json` existem com a MESMA
// estrutura de `pt.json` mas ainda com valores em português (fase 1 não traduz),
// então hoje o fallback quase nunca é exercido. Ele importa para a fase 2: chave
// que o tradutor ainda não preencheu aparece em português, nunca como
// "[missing en.trips.empty.title]" na cara do usuário.
import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import pt from './locales/pt.json';
import en from './locales/en.json';
import es from './locales/es.json';

/** O idioma completo, e o fallback de tudo. */
export const DEFAULT_LOCALE = 'pt';

/**
 * Os três idiomas, na ordem em que a tela de Idioma os lista.
 *
 * `label` é o nome do idioma NA PRÓPRIA LÍNGUA — "English", não "Inglês". Quem
 * procura a própria língua numa lista a reconhece escrita como a escreve, e esse
 * nome não se traduz.
 *
 * `tag` é a tag BCP 47 usada em `Intl` (data, número, moeda). Ela é mais
 * específica que o código do idioma de propósito: `pt-BR` e `pt-PT` formatam data
 * e moeda de formas diferentes, e o app é brasileiro.
 *
 * `mapName` é o campo de nome no tileset do OpenMapTiles — ver
 * `components/map/styleLocalization.js`.
 */
export const SUPPORTED_LOCALES = Object.freeze([
  Object.freeze({ code: 'pt', short: 'PT', label: 'Português (Brasil)', tag: 'pt-BR', mapName: 'name:pt' }),
  Object.freeze({ code: 'en', short: 'EN', label: 'English', tag: 'en-US', mapName: 'name:en' }),
  Object.freeze({ code: 'es', short: 'ES', label: 'Español', tag: 'es-ES', mapName: 'name:es' }),
]);

// O typedef mantem isto como lista de string, e nao como a uniao literal
// ('pt'|'en'|'es') que o TS inferiria do map sobre o array congelado. Sem ele,
// `SUPPORTED_CODES.includes(algumaString)` vira erro de tipo em todo chamador —
// e o ponto destas funcoes e justamente receber string de fora (storage,
// aparelho, parametro de rota) e decidir se serve.
/** @type {readonly string[]} */
export const SUPPORTED_CODES = Object.freeze(SUPPORTED_LOCALES.map((l) => l.code));

/** O valor guardado quando a pessoa não escolheu nada: "siga o aparelho". */
export const AUTOMATIC = 'auto';

export const i18n = new I18n({ pt, en, es });

i18n.defaultLocale = DEFAULT_LOCALE;
// `enableFallback` e TUDO que o fallback precisa no i18n-js v4. A primeira versao
// deste arquivo tambem setava `i18n.fallbacks = true`, que NAO existe na v4 — era
// um no-op que o `tsc` pegou. O teste de fallback passava do mesmo jeito, o que
// mostra que a linha nunca fez nada.
i18n.enableFallback = true;
i18n.locale = DEFAULT_LOCALE;

// Chave que falta NÃO vira texto técnico na tela. Em desenvolvimento ela precisa
// gritar (senão ninguém descobre a chave errada); em produção ela precisa cair no
// português e seguir a vida.
i18n.missingBehavior = 'guess';

/**
 * O código de idioma que o aparelho/navegador pede, limitado aos três.
 *
 * `getLocales()` devolve a lista em ordem de preferência, então um aparelho
 * configurado como "francês, depois espanhol" cai em espanhol — e não em
 * português, que seria o certo só se nenhuma das preferências servisse.
 *
 * @returns {string} 'pt' | 'en' | 'es'
 */
export const detectDeviceLocale = () => {
  try {
    for (const locale of getLocales() || []) {
      // `languageCode` já vem sem a região ("pt", não "pt-BR").
      const code = String(locale?.languageCode || '').toLowerCase();
      if (SUPPORTED_CODES.includes(code)) return code;
    }
  } catch {
    // `expo-localization` pode falhar em ambiente sem as APIs do sistema (teste,
    // SSR). Cair no padrão é melhor do que derrubar o boot do app por causa do
    // idioma.
  }
  return DEFAULT_LOCALE;
};

// ── Persistência ────────────────────────────────────────────────────────────
//
// MESMO PADRÃO DE `onboardingService`: `localStorage`, dentro de try/catch, com
// ausência de storage tratada como "não sei" em vez de erro. Safari em navegação
// privada e iframe com storage bloqueado fazem o `getItem` LANÇAR, não devolver
// null — é por isso que o try/catch envolve até a leitura.
//
// LIMITAÇÃO CONHECIDA, e é a mesma do onboarding: `localStorage` não existe no
// iOS/Android nativo, então lá a escolha vale só pela sessão e volta para
// "Automático" ao reabrir o app. Fica assim de propósito nesta fase — o pedido
// foi usar o padrão existente, e trocar isso por `AsyncStorage` (que o projeto
// ainda não tem) é uma dependência nova que merece entrega própria. Sem coluna no
// banco também: se a escolha tiver de seguir a pessoa entre aparelhos, é outra
// frente.
const STORAGE_KEY = 'journi.locale';

const storage = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * A escolha guardada: um dos três códigos, ou `AUTOMATIC` quando nunca escolheu.
 *
 * @returns {string}
 */
export const readStoredLocaleChoice = () => {
  try {
    const salvo = storage()?.getItem(STORAGE_KEY);
    return SUPPORTED_CODES.includes(salvo) ? salvo : AUTOMATIC;
  } catch {
    return AUTOMATIC;
  }
};

/**
 * Guarda a escolha. `AUTOMATIC` APAGA a chave em vez de gravar a string "auto":
 * ausência já significa "siga o aparelho", e gravar o valor criaria dois jeitos
 * de dizer a mesma coisa.
 *
 * @param {string} choice
 */
export const writeStoredLocaleChoice = (choice) => {
  try {
    const store = storage();
    if (!store) return;
    if (SUPPORTED_CODES.includes(choice)) store.setItem(STORAGE_KEY, choice);
    else store.removeItem(STORAGE_KEY);
  } catch {
    // Sem storage o app funciona; só não lembra o idioma no próximo boot.
  }
};

/**
 * De escolha para idioma efetivo.
 *
 * @param {string} choice `AUTOMATIC` ou um código
 * @returns {string} o código que vale agora
 */
export const resolveLocale = (choice) => (
  SUPPORTED_CODES.includes(choice) ? choice : detectDeviceLocale()
);

/** O descritor completo de um código, sempre com algo (cai no padrão). */
export const localeDescriptor = (code) => (
  SUPPORTED_LOCALES.find((l) => l.code === code)
  || SUPPORTED_LOCALES.find((l) => l.code === DEFAULT_LOCALE)
);

/** A tag BCP 47 de um código — o que `Intl` consome. */
export const localeTag = (code) => localeDescriptor(code).tag;

/**
 * Aplica o idioma no i18n-js. Quem avisa o React é o `LocaleProvider`.
 *
 * @param {string} code
 */
export const applyLocale = (code) => {
  i18n.locale = SUPPORTED_CODES.includes(code) ? code : DEFAULT_LOCALE;
};

// O boot usa a escolha guardada antes de qualquer tela montar, para a primeira
// renderização já sair no idioma certo — sem isso haveria um piscar de português
// em quem escolheu outro.
applyLocale(resolveLocale(readStoredLocaleChoice()));

/**
 * Traduz. Repassa tudo para o i18n-js: `count` para plural, o resto como
 * interpolação.
 *
 * @param {string} key
 * @param {Record<string, unknown>} [options]
 * @returns {string}
 */
export const t = (key, options) => i18n.t(key, options);
