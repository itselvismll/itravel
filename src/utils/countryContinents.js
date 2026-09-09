// Continente de cada país, em português, e o agrupamento das listas do perfil.
//
// A fonte é o campo `region` do COUNTRIES_STATIC — o mesmo dataset que alimenta
// a tela de detalhe do país. Ele traz os cinco continentes em inglês e cobre os
// 195 países, então não há tabela nova a manter aqui: o que este módulo faz é
// traduzir e ordenar.
//
// O dataset tem também `subregion` (América do Norte, do Sul, Caribe...), que
// NÃO é usado de propósito: são mais de vinte valores, e um modal com vinte
// cabeçalhos de seção rolaria mais do que a lista que ele organiza.
//
// Módulo puro, sem React nem React Native: é o que permite exercitá-lo direto
// nos testes.
import { COUNTRIES_STATIC } from '../data/countriesStaticData';
import { getAlpha3, getCountryNamePtByCode } from './countryUtils';

/** Os cinco `region` do dataset, em português. */
export const CONTINENT_PT = {
  Africa: 'África',
  Americas: 'Américas',
  Asia: 'Ásia',
  Europe: 'Europa',
  Oceania: 'Oceania',
};

/** País cujo código não está no dataset. Não some da lista — cai aqui. */
export const UNKNOWN_CONTINENT = 'Outros';

// Ordem FIXA, não alfabética. Alfabética poria "África" antes de "Américas" e
// "Ásia" — três seções começando com A, numa ordem que não diz nada a quem lê.
// Esta é a ordem de leitura de um mapa-múndi, oeste para leste, que é a mesma
// com que as pessoas pensam em viagem. "Outros" fecha a lista por ser a exceção.
export const CONTINENT_ORDER = ['Américas', 'Europa', 'África', 'Ásia', 'Oceania', UNKNOWN_CONTINENT];

/**
 * Continente do país, em português.
 *
 * Aceita alpha-2 ou alpha-3 (as duas listas do perfil guardam `country_code` em
 * formatos que variam com a origem do registro), porque `getAlpha3` normaliza os
 * dois antes da consulta.
 *
 * @param {string} countryCode
 * @returns {string} nome do continente em PT, ou 'Outros'
 */
export const getContinentPt = (countryCode) => {
  const alpha3 = getAlpha3(countryCode);
  const region = alpha3 ? COUNTRIES_STATIC[alpha3]?.region : null;
  return CONTINENT_PT[region] || UNKNOWN_CONTINENT;
};

/**
 * Nome do país em português, a partir de um item das listas do perfil.
 *
 * Mesma leitura que as duas seções já faziam inline: o nome traduzido pelo
 * código, com o `country_name` do registro como reserva.
 *
 * @param {{ country_code?: string, country_name?: string }} country
 */
export const countryLabel = (country) =>
  getCountryNamePtByCode(country?.country_code, country?.country_name || '');

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
 */
export const filterCountries = (countries, query) => {
  const needle = normalizeSearch(query);
  if (!needle) return countries ?? [];
  return (countries ?? []).filter((country) =>
    normalizeSearch(countryLabel(country)).includes(needle)
  );
};

/**
 * Agrupa a lista por continente, na ordem de CONTINENT_ORDER.
 *
 * Devolve no formato que a SectionList espera (`{ title, data }`), e só com as
 * seções que têm país: um cabeçalho "Oceania" vazio seria ruído numa lista que
 * existe para encurtar a leitura.
 *
 * Dentro de cada seção os países saem em ordem alfabética PELO NOME EM
 * PORTUGUÊS — que é o que está escrito na tela. Ordenar pelo código deixaria
 * "Alemanha" (DEU) depois de "Chile" (CHL) sem explicação visível.
 *
 * @param {Array<{country_code?: string, country_name?: string}>} countries
 * @returns {Array<{ title: string, data: Array<any> }>}
 */
export const groupByContinent = (countries) => {
  const byContinent = new Map();

  for (const country of countries ?? []) {
    const continent = getContinentPt(country?.country_code);
    if (!byContinent.has(continent)) byContinent.set(continent, []);
    byContinent.get(continent).push(country);
  }

  const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

  return CONTINENT_ORDER
    .filter((continent) => byContinent.get(continent)?.length)
    .map((continent) => ({
      title: continent,
      data: byContinent
        .get(continent)
        .slice()
        .sort((a, b) => collator.compare(countryLabel(a), countryLabel(b))),
    }));
};
