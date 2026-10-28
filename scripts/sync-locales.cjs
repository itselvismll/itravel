// Gera en.json e es.json a partir de pt.json, com a MESMA estrutura e os valores
// ainda em português.
//
// Gerado, e não escrito à mão, porque estrutura idêntica é o requisito da fase: o
// teste de paridade falha se divergirem, e manter três arquivos alinhados a mão é
// o jeito garantido de produzir chave órfã.
//
// Rodar de novo depois de acrescentar chave em pt.json PRESERVA o que já foi
// traduzido: valor diferente do português não é sobrescrito. É isso que torna
// este script seguro de usar na fase 2.
const fs = require('fs');
const path = require('path');

const dir = path.resolve('src/i18n/locales');
const pt = JSON.parse(fs.readFileSync(path.join(dir, 'pt.json'), 'utf8'));

const ler = (arquivo) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, arquivo), 'utf8'));
  } catch {
    return {};
  }
};

/**
 * Espelha a estrutura de `base`, aproveitando de `atual` todo valor que JÁ foi
 * traduzido (ou seja: que difere do português).
 */
const espelhar = (base, atual) => {
  if (typeof base === 'string') {
    return typeof atual === 'string' && atual !== base ? atual : base;
  }
  const saida = {};
  for (const [chave, valor] of Object.entries(base)) {
    saida[chave] = espelhar(valor, atual?.[chave]);
  }
  return saida;
};

for (const code of ['en', 'es']) {
  const arquivo = `${code}.json`;
  const espelhado = espelhar(pt, ler(arquivo));
  fs.writeFileSync(path.join(dir, arquivo), JSON.stringify(espelhado, null, 2) + '\n');
  console.log('escrito', arquivo);
}

// Cobertura: quantas chaves já diferem do português.
const achatar = (obj, prefixo = '') => Object.entries(obj).flatMap(([k, v]) => (
  typeof v === 'string' ? [[prefixo + k, v]] : achatar(v, prefixo + k + '.')
));

const chavesPt = achatar(pt);
console.log('\nchaves em pt.json:', chavesPt.length);
for (const code of ['en', 'es']) {
  const outras = Object.fromEntries(achatar(ler(`${code}.json`)));
  const traduzidas = chavesPt.filter(([k, v]) => outras[k] !== v).length;
  const pct = ((traduzidas / chavesPt.length) * 100).toFixed(1);
  console.log(`${code}: ${traduzidas}/${chavesPt.length} traduzidas (${pct}%)`);
}
