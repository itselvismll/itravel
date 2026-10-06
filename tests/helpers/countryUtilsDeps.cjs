// As dependências que `src/utils/countryUtils.js` passou a importar quando
// `getCountryName` virou locale-aware (nome de país no idioma pedido, com
// fallback de chave i18n para as 4 nações do Reino Unido).
//
// Compartilhado porque uma dúzia de testes chama `loadEsm('src/utils/countryUtils.js')`
// sem deps — cada um precisaria repetir estas cinco linhas, e divergir aqui é o
// jeito garantido de um teste carregar um `countryUtils` que não bate com o real.
const path = require('path');
const { loadEsm } = require('./load-esm.cjs');

const root = path.resolve(__dirname, '..', '..');

// JSON é CommonJS de verdade — `require` direto serve. Os outros dois são ESM
// (`export const`), e por isso passam pelo mesmo `loadEsm` que carrega o
// próprio countryUtils.js.
const countryUtilsDeps = () => ({
  '../i18n/locales/pt.json': require(path.join(root, 'src/i18n/locales/pt.json')),
  '../i18n/locales/en.json': require(path.join(root, 'src/i18n/locales/en.json')),
  '../i18n/locales/es.json': require(path.join(root, 'src/i18n/locales/es.json')),
  '../data/countriesStaticData': loadEsm('src/data/countriesStaticData.js'),
  './constants': loadEsm('src/utils/constants.js'),
});

module.exports = { countryUtilsDeps };
