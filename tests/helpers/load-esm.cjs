// Carrega um módulo ESM do src/ dentro de um teste CommonJS.
//
// O pacote não tem "type": "module", então o Node trata os .js do src como CJS e
// o import falharia. Transpilar na hora é mais barato do que manter uma cópia
// dos módulos puros em CJS só para os testes.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');

/**
 * @param {string} relativePath caminho a partir da raiz do repo
 * @param {Record<string, any>} [deps] módulos que o arquivo importa, por especificador
 */
const loadEsm = (relativePath, deps = {}) => {
  const filename = path.resolve(__dirname, '..', '..', relativePath);
  const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });

  // runInThisContext e não runInNewContext: um contexto novo é outro realm, e os
  // objetos devolvidos de lá herdam de OUTRO Object.prototype — deepStrictEqual
  // compara protótipos e reprovaria resultados idênticos.
  const factory = vm.runInThisContext(
    `(function (exports, module, require) {\n${code}\n})`,
    { filename }
  );

  const loaded = { exports: {} };
  factory(loaded.exports, loaded, (specifier) => {
    if (specifier in deps) return deps[specifier];
    throw new Error(`load-esm: dependência não fornecida para ${relativePath}: ${specifier}`);
  });
  return loaded.exports;
};

module.exports = { loadEsm };
