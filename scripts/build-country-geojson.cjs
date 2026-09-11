// Gera public/geo/countries.json: as fronteiras do mundo simplificadas.
//
// POR QUE ISTO EXISTE
//
// O app buscava o GeoJSON direto do repositório datasets/geo-countries no
// GitHub. Aquele arquivo tem 14,6 MB (4,4 MB gzip) e 548.472 vértices, e o
// `raw.githubusercontent.com` responde com `cache-control: max-age=300` — cinco
// minutos. Na prática, toda sessão baixava o mundo inteiro de novo.
//
// Os 548k vértices custavam duas vezes: uma no carregamento (download, parse,
// centroides em d3, serialização para o worker do MapLibre) e outra A CADA
// QUADRO, porque a layer de contorno em countryFill.js desenha todos eles — e a
// projeção globe ainda subdivide a geometria para curvar na esfera.
//
// Fronteira de país não precisa de resolução de linha de costa. Esta
// simplificação corta ~93% dos vértices e o arquivo passa a ser servido pelo
// próprio app, com o cache do host, em vez de por um terceiro.
//
// COMO RODAR
//
//   node scripts/build-country-geojson.cjs
//
// Não roda no postinstall de propósito: a saída é DADO, versionado no git, e não
// artefato de build (diferente de copy-maplibre-worker.cjs, que copia um arquivo
// do node_modules e por isso está no .gitignore). Rode à mão quando quiser
// atualizar as fronteiras, e commite o resultado.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SOURCE_URL =
  'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson';

// Quanto detalhe sobra depois da simplificação. No mapshaper a porcentagem é o
// que se MANTÉM, então número maior = mais vértices.
//
// 6% foi calibrado olhando o contorno renderizado em duas escalas: o globo
// inteiro (o `zoom: 1.4` de GLOBE_INITIAL_VIEW) e o nível de país (o `zoom: 5` de
// COUNTRY_ZOOM, em featuredCountries.js). No globo inteiro qualquer valor a
// partir de 2% é indistinguível do original — a tela não tem pixels para mostrar
// a diferença. Quem manda na escolha é o zoom fechado, e lá a costa da Noruega é
// o caso mais duro: em 4% os fiordes viram uma linha de facetas e as ilhas do
// Lofoten viram triângulos; em 6% eles voltam a ler como fiordes. Os 10% que
// vêm depois refinam quase só acima do zoom 5, por +127 KB gzip.
//
// RESSALVA: acima do zoom ~8 a fronteira simplificada começa a descolar
// visivelmente da linha de costa do satélite por baixo. É aceito: o território
// pintado marca o PAÍS, e quem carrega o detalhe naquela escala é a imagem.
const SIMPLIFY_PERCENT = 6;

// Casas decimais das coordenadas. 0,001° ≈ 110 m, bem abaixo do que a
// simplificação já descartou — serve só para não gravar os 15 dígitos que o
// JSON.stringify emitiria.
const PRECISION = 0.001;

// Campos preservados. São EXATAMENTE os que o app lê, e a lista existe para
// impedir que campos novos do upstream entrem no arquivo sem ninguém decidir:
//
//   - `ISO3166-1-Alpha-3` — o caminho principal de getGeoCountryAlpha3, e o que
//     withUkNations usa para achar e remover a feature 'GBR'.
//   - `ISO3166-1-Alpha-2` — o fallback. NÃO é redundante: 22 das 258 features do
//     dataset não têm um Alpha-3 válido (vem '-99') e só são identificadas por
//     aqui. Cortar este campo apagaria 22 países do mapa.
//   - `name` — getGeoCountryName, que alimenta o índice de nomes dos badges em
//     useGlobeCountries e o desempate de FRA/NOR em GEO_COUNTRY_ALPHA3_OVERRIDES.
//
// Hoje o dataset tem só esses três, então o filtro não muda o tamanho. Ele está
// aqui pelo dia em que o upstream mudar.
const KEPT_FIELDS = ['ISO3166-1-Alpha-3', 'ISO3166-1-Alpha-2', 'name'];

const root = path.join(__dirname, '..');
const outputDir = path.join(root, 'public', 'geo');
const outputFile = path.join(outputDir, 'countries.json');
const tempFile = path.join(outputDir, '.source.geojson');

const megabytes = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

const countVertices = (geojson) => {
  let total = 0;
  const walk = (coordinates) => {
    if (typeof coordinates[0] === 'number') {
      total += 1;
      return;
    }
    if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === 'number') {
      total += coordinates.length;
      return;
    }
    coordinates.forEach(walk);
  };
  for (const feature of geojson.features) {
    if (feature.geometry) walk(feature.geometry.coordinates);
  }
  return total;
};

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  process.stdout.write(`Baixando ${SOURCE_URL}\n`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Falha ao baixar o GeoJSON de origem (HTTP ${response.status})`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(tempFile, source);

  try {
    // `keep-shapes` é obrigatório e não é um detalhe: sem ele, a simplificação
    // apaga polígonos inteiros que ficaram pequenos demais — e os que somem
    // primeiro são justamente as ilhas do Caribe e do Pacífico, que são países
    // inteiros no app. Com ele, nenhuma feature desaparece.
    // O bin do mapshaper é chamado pelo Node, e não por `npx`: no Windows o
    // execFileSync não consegue lançar `npx.cmd` (EINVAL, porque é um .cmd e não
    // um executável), e `shell: true` resolveria isso pagando com interpolação
    // de shell nos argumentos. Resolver o caminho do pacote também garante que a
    // versão usada é a do devDependencies, não uma que o npx baixe na hora.
    execFileSync(
      process.execPath,
      [
        require.resolve('mapshaper/bin/mapshaper'),
        tempFile,
        '-filter-fields',
        KEPT_FIELDS.join(','),
        '-simplify',
        'visvalingam',
        `${SIMPLIFY_PERCENT}%`,
        'keep-shapes',
        '-o',
        `precision=${PRECISION}`,
        'format=geojson',
        outputFile,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] }
    );
  } finally {
    fs.rmSync(tempFile, { force: true });
  }

  const before = JSON.parse(source.toString('utf8'));
  const after = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

  // A contagem de features é uma trava, não uma estatística: se `keep-shapes`
  // falhar ou o filtro de campos derrubar alguma feature, o país some do globo
  // sem erro nenhum — o mapa só fica sem ele. Melhor quebrar o script.
  if (after.features.length !== before.features.length) {
    throw new Error(
      `A simplificação perdeu features: ${before.features.length} -> ${after.features.length}`
    );
  }

  const sizeBefore = source.length;
  const sizeAfter = fs.statSync(outputFile).size;
  const verticesBefore = countVertices(before);
  const verticesAfter = countVertices(after);

  process.stdout.write(
    [
      '',
      `Gerado: ${path.relative(root, outputFile)}`,
      `  features  ${before.features.length} -> ${after.features.length}`,
      `  vertices  ${verticesBefore} -> ${verticesAfter} (-${Math.round(
        (1 - verticesAfter / verticesBefore) * 100
      )}%)`,
      `  tamanho   ${megabytes(sizeBefore)} -> ${megabytes(sizeAfter)}`,
      '',
      'Commite o arquivo: ele e dado versionado, nao artefato de build.',
      '',
    ].join('\n')
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
