// Silenciamento do 403 dos tiles de satélite.
//
// A imagem do globo vem do Mapbox (mapbox.satellite); a da Stadia saiu porque o
// plano Starter não a serve fora de localhost. Em qualquer um dos dois, um 403
// no tile de imagem significa a mesma coisa — a conta não tem direito de servir
// aquela foto naquele domínio —, não há o que fazer a respeito em tempo de
// execução, e sem o silêncio o erro se repetiria a cada tile de cada quadro.
//
// O risco desse tipo de silêncio é engolir junto o que importa. Estes testes
// existem para provar que o filtro é ESTREITO: só o 403 daqueles caminhos passa
// a ser ignorado, e qualquer outra falha do mapa continua chegando na tela.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadEsm } = require('./helpers/load-esm.cjs');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

// Um comentário que só MENCIONA `ignoreAllLogs` (para explicar por que não se usa)
// não pode reprovar o teste que proíbe a chamada.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const MAPBOX_TOKEN = 'pk.test';
const globeConfig = loadEsm('src/components/map/globeConfig.js', {
  '../../utils/constants': { API_CONFIG: { STADIA_API_KEY: '', MAPBOX_TOKEN } },
});

const { isSatelliteTileError, SATELLITE_TILE_LOG_PATTERN, MAPBOX_SATELLITE_SOURCE } = globeConfig;

// O formato que o MapLibre entrega no evento `error`: um AJAXError com status e
// url próprios, e a mensagem no formato "Forbidden (403): <url>".
const ajaxError = (status, url) => ({
  status,
  url,
  message: `${status === 403 ? 'Forbidden' : 'Error'} (${status}): ${url}`,
});

// Caminho atual da imagem (Mapbox) e o antigo (Stadia): os dois são cobertos,
// porque a config antiga segue comentada em globeConfig para reverter rápido.
const MAPBOX_IMAGERY_URL =
  'https://api.mapbox.com/v4/mapbox.satellite/6/33/24@2x.jpg90?access_token=pk.test';
const IMAGERY_URL = 'https://tiles.stadiamaps.com/data/imagery/6/33/24.jpg?api_key=abc';
const VECTOR_URL = 'https://tiles.stadiamaps.com/data/openmaptiles/6/33/24.pbf?api_key=abc';

test('a source de satélite aponta para o tileset do Mapbox, com tile de 512 (@2x)', () => {
  assert.equal(MAPBOX_SATELLITE_SOURCE.type, 'raster');
  assert.deepEqual(MAPBOX_SATELLITE_SOURCE.tiles, [
    `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
  ]);
  // O `@2x` e o 512 são um par: o @2x é a variante que devolve um tile de 512 de
  // verdade. Um tile de 512 cobre o mesmo chão que quatro de 256, com ~30% menos
  // bytes por pixel e — o que importa no gesto — 1/4 das requisições, decodes de
  // JPEG e uploads de textura. Declarar 512 sem o @2x borraria o globo.
  //
  // O maxzoom é o do tileset — acima do GLOBE_MAX_ZOOM, então nunca falta.
  assert.equal(MAPBOX_SATELLITE_SOURCE.tileSize, 512);
  assert.equal(MAPBOX_SATELLITE_SOURCE.maxzoom, 22);
});

test('sem token do Mapbox não se monta uma source quebrada', () => {
  // Melhor cair para a imagery da Stadia (403 silencioso, o comportamento antigo)
  // do que pedir tiles com `access_token=undefined` a cada quadro.
  const semToken = loadEsm('src/components/map/globeConfig.js', {
    '../../utils/constants': { API_CONFIG: { STADIA_API_KEY: '', MAPBOX_TOKEN: '' } },
  });
  assert.equal(semToken.MAPBOX_SATELLITE_SOURCE, null);
});

test('o 403 dos tiles de satélite é reconhecido, no Mapbox e na Stadia', () => {
  assert.equal(isSatelliteTileError(ajaxError(403, MAPBOX_IMAGERY_URL)), true);
  assert.equal(isSatelliteTileError(ajaxError(403, IMAGERY_URL)), true);
});

test('erro sem os campos estruturados ainda é reconhecido pela mensagem', () => {
  // Rede de segurança: se o erro chegar embrulhado e perder status/url, a
  // mensagem ainda carrega as duas informações.
  assert.equal(
    isSatelliteTileError({ message: `AJAXError: Forbidden (403): ${IMAGERY_URL}` }),
    true
  );
});

test('nenhum outro erro do mapa é silenciado', () => {
  const outros = [
    // Mesmo caminho, outro status: 401 é token/key ausente ou inválido —
    // acionável, tem de aparecer.
    ajaxError(401, MAPBOX_IMAGERY_URL),
    ajaxError(401, IMAGERY_URL),
    ajaxError(404, IMAGERY_URL),
    ajaxError(500, IMAGERY_URL),
    // Mesmo status, outro recurso: 403 no tile vetorial não é o caso aceito.
    ajaxError(403, VECTOR_URL),
    // 403 em outro endpoint do Mapbox também não: o filtro é do tileset de
    // satélite, não do host inteiro.
    ajaxError(403, 'https://api.mapbox.com/geocoding/v5/mapbox.places/roma.json'),
    ajaxError(403, 'https://tiles.stadiamaps.com/styles/alidade_satellite.json'),
    ajaxError(403, 'https://exemplo.com/data/other/1/2/3.jpg'),
    // Erros que não são de rede.
    { message: 'Style is not done loading' },
    new Error('WebGL context lost'),
    null,
    undefined,
  ];

  for (const erro of outros) {
    assert.equal(
      isSatelliteTileError(erro),
      false,
      `silenciou o que não devia: ${JSON.stringify(erro?.message ?? erro)}`
    );
  }
});

test('o padrão do LogBox exige a URL do imagery E o 403 na mesma mensagem', () => {
  assert.match(`AJAXError: Forbidden (403): ${MAPBOX_IMAGERY_URL}`, SATELLITE_TILE_LOG_PATTERN);
  assert.match(`AJAXError: Forbidden (403): ${IMAGERY_URL}`, SATELLITE_TILE_LOG_PATTERN);

  // Um 403 solto, ou o imagery com outro problema, continua visível no dev nativo.
  assert.doesNotMatch('Forbidden (403): https://api.exemplo.com/v1/me', SATELLITE_TILE_LOG_PATTERN);
  assert.doesNotMatch(`AJAXError: Not Found (404): ${IMAGERY_URL}`, SATELLITE_TILE_LOG_PATTERN);
  assert.doesNotMatch(
    `AJAXError: Not Found (404): ${MAPBOX_IMAGERY_URL}`,
    SATELLITE_TILE_LOG_PATTERN
  );
  assert.doesNotMatch('Warning: cada child precisa de uma key', SATELLITE_TILE_LOG_PATTERN);
});

test('o silêncio é declarado por padrão, nunca com ignoreAllLogs', () => {
  const app = read('App.js');

  assert.match(app, /LogBox\.ignoreLogs\(\[SATELLITE_TILE_LOG_PATTERN\]\)/);
  // ignoreAllLogs apagaria o app inteiro do LogBox — é o oposto do que se quer.
  for (const file of ['App.js', 'src/components/map/GlobeMap.web.js']) {
    assert.doesNotMatch(stripComments(read(file)), /ignoreAllLogs/, `${file} desliga o LogBox inteiro`);
  }
});

test('o overlay de erro do globo só é pulado para o tile de satélite', () => {
  const globeMap = read('src/components/map/GlobeMap.web.js');

  // O filtro vem ANTES do setFailure: é o que impede o overlay vermelho.
  const handler = globeMap.split('const handleError')[1] ?? '';
  const guardIndex = handler.indexOf('isSatelliteTileError');
  const failureIndex = handler.indexOf('setFailure');
  assert.ok(guardIndex >= 0, 'o handler de erro não filtra o tile de satélite');
  assert.ok(guardIndex < failureIndex, 'o filtro precisa vir antes do setFailure');

  // E o caminho normal continua existindo para todo o resto.
  assert.match(globeMap, /setFailure\(message\)/);
  assert.match(globeMap, /onErrorRef\.current\?\.\(/);
});
