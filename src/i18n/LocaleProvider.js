// O que falta ao i18n-js: avisar o React quando o idioma muda.
//
// `i18n.t()` é uma função comum lendo uma variável de módulo. Trocar
// `i18n.locale` não re-renderiza nada — as telas continuam mostrando o idioma
// anterior até alguma outra coisa causar render, o que na prática significa que
// escolher outro idioma não faz nada visível até trocar de tela.
//
// Este contexto é a correção inteira, e é o custo consciente de não usar o
// react-i18next (ver o comentário em `./index.js`). Ele guarda a ESCOLHA
// (`auto` ou um código) e expõe o idioma EFETIVO; quem lê precisa dos dois, por
// motivos diferentes: a tela de Idioma marca a opção escolhida (e "Automático"
// precisa aparecer selecionado, não "Português"), e o resto do app só quer saber
// em que língua está.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AUTOMATIC,
  applyLocale,
  detectDeviceLocale,
  localeTag,
  readStoredLocaleChoice,
  resolveLocale,
  t as translate,
  writeStoredLocaleChoice,
} from './index';

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  // O estado nasce do storage, não do padrão: a primeira renderização já sai no
  // idioma certo. `index.js` também aplica no import, pelo mesmo motivo — um
  // `useEffect` aqui deixaria o primeiro frame em português.
  const [choice, setChoice] = useState(() => readStoredLocaleChoice());

  const locale = resolveLocale(choice);
  applyLocale(locale);

  const changeLocale = useCallback((novaEscolha) => {
    writeStoredLocaleChoice(novaEscolha);
    applyLocale(resolveLocale(novaEscolha));
    setChoice(novaEscolha);
  }, []);

  const value = useMemo(() => ({
    /** `AUTOMATIC` ou um dos códigos — o que a tela de Idioma marca. */
    choice,
    /** O idioma que vale agora: 'pt' | 'en' | 'es'. */
    locale,
    /** A tag BCP 47 para `Intl`: 'pt-BR' | 'en-US' | 'es-ES'. */
    tag: localeTag(locale),
    /** Em que idioma "Automático" cai agora — a tela mostra isso ao lado. */
    automaticResolvesTo: detectDeviceLocale(),
    changeLocale,
    // `t` é recriado quando o idioma muda, de propósito: é a identidade DELE que
    // faz os `useMemo` e `useCallback` das telas que traduzem recalcularem. Se
    // fosse estável, um texto memoizado ficaria no idioma antigo.
    t: (key, options) => translate(key, options),
  }), [choice, locale, changeLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * O hook das telas.
 *
 * Fora do provider ele NÃO lança: devolve um valor que funciona, em português.
 * Isso é deliberado — o app tem telas que montam fora da árvore principal
 * (`ScreenErrorBoundary` é o caso claro: ele existe para renderizar quando algo
 * acima quebrou) e um erro de contexto ali trocaria uma tela de erro legível por
 * uma tela branca.
 */
export const useLocale = () => useContext(LocaleContext) || {
  choice: AUTOMATIC,
  locale: 'pt',
  tag: 'pt-BR',
  automaticResolvesTo: 'pt',
  changeLocale: () => {},
  t: translate,
};

/** Atalho para quem só quer traduzir. */
export const useTranslation = () => useLocale().t;
