#!/usr/bin/env node
//
// Trava de AMBIENTE antes do export — falha alto se faltar uma variável
// `EXPO_PUBLIC_*` que o app precisa para abrir de verdade, em vez de deixar
// `expo export` terminar com exit 0 e entregar um bundle quebrado.
//
// ═══════════════════════════════════════════════════════════════════════════
//  Esta é a CAMADA 1 de duas. A CAMADA 2 é `verifyBundle()` dentro de
//  scripts/deploy-web.cjs, que confere o BUNDLE já exportado. As duas são
//  necessárias e nenhuma substitui a outra: uma variável pode estar presente
//  no AMBIENTE desta máquina e ainda assim não ir para o bundle (Metro
//  cacheando um export anterior, um `.env` lido de outro diretório); e o
//  bundle pode estar correto mesmo que este script não pudesse prová-lo antes
//  de exportar (CI que injeta a variável só no passo de build). A camada 1
//  pega o erro mais cedo e com uma mensagem mais clara; a camada 2 é a que não
//  tem como ser burlada, porque olha o artefato publicado de verdade.
// ═══════════════════════════════════════════════════════════════════════════
//
// TERCEIRO INCIDENTE, 27/10/2026: um deploy saiu de uma máquina cujo `.env`
// não tinha `EXPO_PUBLIC_MAPBOX_TOKEN`. Sem o token, `MAPBOX_SATELLITE_SOURCE`
// (src/components/map/globeConfig.js) vira `null`, `loadGlobeStyle()` não
// troca a source de imagem, o globo volta a pedir satélite para a Stadia, que
// responde 403 — e `isSatelliteTileError` engole esse erro de propósito (ver
// comentário lá). Resultado: globo sem satélite em produção, SEM nenhum erro
// visível, e ninguém percebeu até alguém reclamar. Nada avisava antes do
// export; este script é o aviso.
//
// CLASSIFICAÇÃO: obrigatória vs. opcional por design
//
// A classificação é uma DECISÃO registrada aqui, não um padrão genérico tipo
// "toda EXPO_PUBLIC_* é obrigatória" (isso quebraria em variáveis que
// degradam de propósito) nem "nenhuma é, a não ser que alguém reclame" (foi
// exatamente isso que já aconteceu três vezes). `tests/check-build-env.test.cjs`
// cobra que toda variável `EXPO_PUBLIC_*` declarada em `.env.example` apareça
// em UMA das duas listas abaixo — uma variável nova em `.env.example` nasce
// sem dono até alguém decidir onde ela entra, em vez de ficar de fora da
// checagem em silêncio.
//
// Obrigatórias — sem valor de verdade, o app não abre (Supabase, ver o
// incidente de 15/09/2026 em AGENTS.md) ou degrada de um jeito que não dá
// erro nenhum e só aparece abrindo o globo (Mapbox, ver acima):
const REQUIRED_ENV_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_MAPBOX_TOKEN',
];

// Opcionais por design — cada uma tem a degradação pretendida documentada
// aqui E no código que lê a variável, porque "é opcional" sem dizer o que
// acontece sem ela é só uma lacuna adiada:
//
//   • EXPO_PUBLIC_STADIA_API_KEY — .env.example: em localhost e nos domínios
//     cadastrados no painel da Stadia a key é opcional; fora deles os tiles
//     respondem 401 sem ela. Produção (journi.expo.app) está cadastrada.
//   • EXPO_PUBLIC_FACEBOOK_APP_ID — src/utils/instagram.js: sem ela o botão
//     "Compartilhar no Instagram" avisa que o recurso não está configurado,
//     em vez de falhar em silêncio. Degradação com aviso na UI, não erro.
//   • EXPO_PUBLIC_HCAPTCHA_SITE_KEY — src/components/auth/hcaptchaConfig.js:
//     `HCAPTCHA_ENABLED` cai para `false`, a tela libera o submit sem
//     desafio, e o Supabase segue recusando pelo lado do servidor. Degradação
//     intencional, documentada no próprio arquivo.
//   • EXPO_PUBLIC_GOOGLE_MAPS_API_KEY — src/components/PhotoUploader.js cai
//     para um `TextInput` simples em vez do autocomplete do Google Places.
//   • EXPO_PUBLIC_WEB_APP_URL — src/utils/constants.js já tem fallback
//     correto (`https://journi.expo.app`), a própria URL de produção.
const OPTIONAL_ENV_VARS = [
  'EXPO_PUBLIC_STADIA_API_KEY',
  'EXPO_PUBLIC_FACEBOOK_APP_ID',
  'EXPO_PUBLIC_HCAPTCHA_SITE_KEY',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  'EXPO_PUBLIC_WEB_APP_URL',
];

const fs = require('fs');
const path = require('path');
const { loadEffectiveEnv } = require('./lib/readEnvFile.cjs');

const root = path.resolve(__dirname, '..');

/**
 * Os nomes `EXPO_PUBLIC_*` que `.env.example` declara — usado só para provar
 * que REQUIRED_ENV_VARS + OPTIONAL_ENV_VARS não ficou atrás do arquivo.
 * @param {string} envExampleSource
 * @returns {string[]}
 */
const declaredExpoPublicVars = (envExampleSource) => [...new Set(
  [...envExampleSource.matchAll(/^\s*(EXPO_PUBLIC_[A-Z0-9_]+)\s*=/gm)].map((match) => match[1])
)];

/**
 * @param {{ env: Record<string, string | undefined>, envExampleSource: string }} input
 * @returns {{ missing: string[], unclassified: string[] }}
 */
const checkBuildEnv = ({ env, envExampleSource }) => {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name]);
  const classified = new Set([...REQUIRED_ENV_VARS, ...OPTIONAL_ENV_VARS]);
  const unclassified = declaredExpoPublicVars(envExampleSource)
    .filter((name) => !classified.has(name));
  return { missing, unclassified };
};

const main = () => {
  const env = loadEffectiveEnv(root);
  const envExampleSource = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const { missing, unclassified } = checkBuildEnv({ env, envExampleSource });

  if (unclassified.length) {
    // Isto é um erro de MANUTENÇÃO deste script, não do ambiente de quem
    // publica — por isso a mensagem fala com quem edita .env.example, não com
    // quem está rodando o deploy.
    console.error(
      `\n✗ .env.example declara ${unclassified.join(', ')}, mas scripts/check-build-env.cjs\n`
      + 'não classificou (nem como obrigatória, nem como opcional por design).\n'
      + 'Decida onde entra e acrescente à lista correspondente, com o motivo.\n'
    );
    process.exit(1);
  }

  if (missing.length) {
    console.error(
      `\n✗ Faltam estas variáveis obrigatórias (.env / .env.local / ambiente): ${missing.join(', ')}\n\n`
      + '  O app não abre, ou degrada sem erro visível, sem elas:\n'
      + missing.map((name) => `    • ${name}`).join('\n')
      + '\n\n  Confira se .env ou .env.local existem na raiz do projeto e têm estas\n'
      + '  chaves preenchidas. NADA foi exportado.\n'
    );
    process.exit(1);
  }

  console.log(`✓ ambiente de build conferido: ${REQUIRED_ENV_VARS.join(', ')}`);
};

if (require.main === module) main();

module.exports = { REQUIRED_ENV_VARS, OPTIONAL_ENV_VARS, declaredExpoPublicVars, checkBuildEnv };
