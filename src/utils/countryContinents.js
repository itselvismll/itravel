// Continente de cada país, e o agrupamento das listas do perfil.
//
// A fonte é o campo `region` do COUNTRIES_STATIC — o mesmo dataset que alimenta
// a tela de detalhe do país. Ele traz os cinco continentes em inglês e cobre os
// 195 países, então não há tabela nova a manter aqui: o que este módulo faz é
// mapear para um código estável e ordenar.
//
// O dataset tem também `subregion` (América do Norte, do Sul, Caribe...), que
// NÃO é usado de propósito: são mais de vinte valores, e um modal com vinte
// cabeçalhos de seção rolaria mais do que a lista que ele organiza.
//
// Módulo puro, sem React nem React Native: é o que permite exercitá-lo direto
// nos testes. É por isso que o rótulo do continente sai como CHAVE de tradução
// (`titleKey`), não como texto — quem renderiza resolve com `t()`, mesmo padrão
// de `labelKey`/`titleKey` usado no resto do app (ver `ROLE_LABEL_KEY` em
// `tripPermissions.js`). O idioma do PAÍS dentro de cada seção entra como
// PARÂMETRO (`tag`), nunca lido de um "idioma atual" global — mesma regra de
// `formatDate`/`formatNumber`/`getCountryName`.
import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getAlpha3, getCountryName } from './countryUtils';
import { DEFAULT_LOCALE_TAG } from './constants';

/** Os cinco `region` do dataset, para um código estável (não é texto de tela). */
export const CONTINENT_CODE = {
  Africa: 'africa',
  Americas: 'americas',
  Asia: 'asia',
  Europe: 'europe',
  Oceania: 'oceania',
};

/** País cujo código não está no dataset. Não some da lista — cai aqui. */
export const UNKNOWN_CONTINENT = 'other';

// Ordem FIXA, não alfabética. Alfabética poria "africa" antes de "americas" e
// "asia" em português, mas não necessariamente nos outros idiomas — e de
// qualquer forma três seções consecutivas começando com a mesma letra não diz
// nada a quem lê. Esta é a ordem de leitura de um mapa-múndi, oeste para leste,
// que é a mesma com que as pessoas pensam em viagem. "other" fecha a lista por
// ser a exceção.
export const CONTINENT_ORDER = ['americas', 'europe', 'africa', 'asia', 'oceania', UNKNOWN_CONTINENT];

const CONTINENT_LABEL_KEY = {
  americas: 'countryList.continents.americas',
  europe: 'countryList.continents.europe',
  africa: 'countryList.continents.africa',
  asia: 'countryList.continents.asia',
  oceania: 'countryList.continents.oceania',
  other: 'countryList.continents.other',
};

/** A chave de tradução do rótulo de um continente — quem renderiza resolve com `t()`. */
export const continentLabelKey = (continent) => CONTINENT_LABEL_KEY[continent] || CONTINENT_LABEL_KEY[UNKNOWN_CONTINENT];

/**
 * Código do continente do país.
 *
 * Aceita alpha-2 ou alpha-3 (as duas listas do perfil guardam `country_code` em
 * formatos que variam com a origem do registro), porque `getAlpha3` normaliza os
 * dois antes da consulta.
 *
 * @param {string} countryCode
 * @returns {string} um de CONTINENT_ORDER
 */
export const getContinentCode = (countryCode) => {
  const alpha3 = getAlpha3(countryCode);
  const region = alpha3 ? COUNTRIES_STATIC[alpha3]?.region : null;
  return CONTINENT_CODE[region] || UNKNOWN_CONTINENT;
};

/**
 * Nome do país no idioma pedido, a partir de um item das listas do perfil.
 *
 * Mesma leitura que as duas seções já faziam inline: o nome traduzido pelo
 * código, com o `country_name` do registro como reserva.
 *
 * @param {{ country_code?: string, country_name?: string }} country
 * @param {string} [tag] tag BCP 47 do idioma ativo
 */
export const countryLabel = (country, tag = DEFAULT_LOCALE_TAG) =>
  getCountryName(country?.country_code, country?.country_name || '', tag);

/**
 * Texto comparável: sem acento, sem caixa, sem espaço nas pontas.
 *
 * A normalização é o que faz "africa" achar "África" e "SAO" achar "São Tomé".
 * Sem ela a busca só serviria para quem digita com acento — que é justamente
 * quem menos precisa de busca, porque já sabe escrever o nome.
 *
 * @param {string} value
 */
export const normalizeSearch = (value) =>
  String(value ?? '')
    .normalize('NFD')
    // ̀-ͯ é o bloco de acentos que o NFD separou da letra.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Filtra por nome de país, ignorando acento e caixa.
 *
 * Consulta vazia devolve a lista inteira, e não nenhum resultado: o campo de
 * busca começa vazio, e uma lista vazia ao abrir o modal pareceria erro.
 *
 * @param {Array<any>} countries
 * @param {string} query
 * @param {string} [tag] tag BCP 47 do idioma ativo — o nome buscado é o exibido
 */
export const filterCountries = (countries, query, tag = DEFAULT_LOCALE_TAG) => {
  const needle = normalizeSearch(query);
  if (!needle) return countries ?? [];
  return (countries ?? []).filter((country) =>
    normalizeSearch(countryLabel(country, tag)).includes(needle)
  );
};

/**
 * Agrupa a lista por continente, na ordem de CONTINENT_ORDER.
 *
 * Devolve no formato que a SectionList espera, com `titleKey` em vez de
 * `title`: quem renderiza resolve com `t(section.titleKey)` — ver o cabeçalho
 * do arquivo. Só entram as seções que têm país: um cabeçalho "Oceania" vazio
 * seria ruído numa lista que existe para encurtar a leitura.
 *
 * Dentro de cada seção os países saem em ordem alfabética PELO NOME EXIBIDO —
 * que é o nome no idioma de `tag`. Ordenar pelo código deixaria "Germany"
 * depois de "Chile" sem explicação visível.
 *
 * @param {Array<{country_code?: string, country_name?: string}>} countries
 * @param {string} [tag] tag BCP 47 do idioma ativo
 * @returns {Array<{ titleKey: string, data: Array<any> }>}
 */
export const groupByContinent = (countries, tag = DEFAULT_LOCALE_TAG) => {
  const byContinent = new Map();

  for (const country of countries ?? []) {
    const continent = getContinentCode(country?.country_code);
    if (!byContinent.has(continent)) byContinent.set(continent, []);
    byContinent.get(continent).push(country);
  }

  const collator = new Intl.Collator(tag, { sensitivity: 'base' });

  return CONTINENT_ORDER
    .filter((continent) => byContinent.get(continent)?.length)
    .map((continent) => ({
      titleKey: continentLabelKey(continent),
      data: byContinent
        .get(continent)
        .slice()
        .sort((a, b) => collator.compare(countryLabel(a, tag), countryLabel(b, tag))),
    }));
};
