// O maplibre-gl roda a tesselação de tiles num Web Worker que precisa ser servido
// como arquivo próprio (o Metro não sabe emitir esse chunk separado). Copiamos o
// worker e o chunk compartilhado dele para public/maplibre, que o Expo Web serve
// na raiz do site. GlobeMap.web.js aponta config.WORKER_URL para lá.
//
// Roda no postinstall para a cópia acompanhar a versão instalada do maplibre-gl.
const fs = require('fs');
const path = require('path');

const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
const root = path.join(__dirname, '..');
const source = path.join(root, 'node_modules', 'maplibre-gl', 'dist');
const target = path.join(root, 'public', 'maplibre');

if (!fs.existsSync(source)) {
  // maplibre-gl ainda não instalado (ex.: install parcial) — nada a fazer.
  process.exit(0);
}

fs.mkdirSync(target, { recursive: true });
for (const file of FILES) {
  fs.copyFileSync(path.join(source, file), path.join(target, file));
}

const { version } = require(path.join(root, 'node_modules', 'maplibre-gl', 'package.json'));
fs.writeFileSync(
  path.join(target, 'VERSION'),
  `maplibre-gl ${version} — gerado por scripts/copy-maplibre-worker.cjs, nao edite\n`
);
