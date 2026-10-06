#!/usr/bin/env node
//
// Confere o que journi.expo.app está servindo AGORA — não o que acabamos de
// exportar localmente. Pega exatamente o buraco que a checagem pré-deploy (em
// deploy-web.cjs) não cobre: um deploy publicado por fora dela.
//
// Roda de dois jeitos:
//   1. Sozinho, a qualquer momento: `npm run verify:prod`. É o que o workflow
//      agendado (.github/workflows/verify-production.yml) chama, e é o que
//      detectaria o incidente de 06/10/2026 sem precisar de ninguém notar o
//      globo transparente primeiro.
//   2. Chamado por scripts/deploy-web.cjs, logo depois de publicar — a mesma
//      checagem, mas contra o deploy que o PRÓPRIO script acabou de fazer, em
//      vez de confiar que "publicou sem erro" significa "publicou certo".
//
// Sai com exit 1 (e não publica nem desfaz nada — isto é só leitura) quando o
// que está no ar não tem as chaves exigidas.
const { findMissingBundleKeys, REQUIRED_BUNDLE_KEYS } = require('./lib/requiredBundleKeys.cjs');

const SITE_URL = 'https://journi.expo.app';

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ao buscar ${url}`);
  return response.text();
};

/** As URLs dos bundles JS referenciados pela página publicada agora. */
const findBundleUrls = (html) => {
  const matches = html.matchAll(/_expo\/static\/js\/web\/[^"'\s]+\.js/g);
  const urls = [...new Set([...matches].map((m) => m[0]))];
  if (!urls.length) throw new Error(`${SITE_URL} não referencia nenhum bundle _expo/static/js/web/*.js — a página em si pode estar fora do ar.`);
  return urls.map((path) => `${SITE_URL}/${path}`);
};

const verifyProduction = async () => {
  console.log(`Lendo ${SITE_URL}...`);
  const html = await fetchText(SITE_URL);
  const bundleUrls = findBundleUrls(html);

  const bundleSource = (
    await Promise.all(bundleUrls.map((url) => {
      console.log(`Lendo ${url}...`);
      return fetchText(url);
    }))
  ).join('\n');

  const missing = findMissingBundleKeys(bundleSource);

  if (!missing.length) {
    console.log(`\n✓ produção verificada: ${REQUIRED_BUNDLE_KEYS.map((entry) => entry.name).join(', ')}`);
    return;
  }

  throw new Error(
    `O QUE ESTÁ NO AR AGORA está sem estas variáveis: ${missing.map((entry) => entry.name).join(', ')}.\n`
    + `Bundle(s) verificado(s): ${bundleUrls.join(', ')}\n`
    + 'Isto é produção já publicada, não um export local — alguém publicou por\n'
    + 'fora de `npm run deploy:web`, ou o build teve um problema depois da\n'
    + 'checagem pré-deploy. Republique com `npm run deploy:web`.'
  );
};

verifyProduction().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
});
