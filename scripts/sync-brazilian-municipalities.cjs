const fs = require('node:fs');
const path = require('node:path');

const SOURCE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome';
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/brazilianMunicipalities.json');

const getStateCode = municipality => (
  municipality?.microrregiao?.mesorregiao?.UF?.sigla
  || municipality?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
  || ''
);

async function main() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`IBGE respondeu HTTP ${response.status}`);

  const municipalities = await response.json();
  const compact = municipalities
    .map(item => [item.nome, getStateCode(item), item.id])
    .filter(([name, state, id]) => name && state && id);

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(compact)}\n`, 'utf8');
  console.log(`Gravados ${compact.length} municípios oficiais em ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
