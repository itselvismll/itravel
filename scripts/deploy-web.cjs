#!/usr/bin/env node
//
// Publica o site (journi.expo.app) — e recusa publicar um build sem chaves.
//
// ═══════════════════════════════════════════════════════════════════════════
//  USE SEMPRE ESTE SCRIPT.  Nunca rode `expo export -p web` e `eas deploy`
//  separadamente, na mão: foi assim que a produção foi ao ar, em 15/09/2026,
//  com o bundle sem NENHUMA variável de ambiente — e o app quebrou no boot
//  para todos os usuários. O passo que só existe aqui é a VERIFICAÇÃO do
//  bundle antes de publicar.
// ═══════════════════════════════════════════════════════════════════════════
//
// O BUG QUE ESTE SCRIPT EXISTE PARA IMPEDIR
//
// Em 15/09/2026 a produção foi ao ar com o bundle sem NENHUMA variável
// `EXPO_PUBLIC_*`. O app quebrava no boot, para todo mundo, na primeira linha de
// src/services/supabase.js: "Configuração do Supabase ausente". O bundle
// publicado trazia `SUPABASE_URL:void 0` e `MAPBOX_TOKEN:''` — prova de que
// nenhum arquivo .env foi lido no momento do `expo export`.
//
// A falha é silenciosa por natureza: `expo export` não sabe que aquelas
// variáveis são obrigatórias, então ele termina com exit 0, imprime "Exported" e
// entrega um site que não abre. Entre exportar e publicar não havia nada olhando.
//
// Agora há: o passo de verificação abre o bundle gerado e procura os valores. Se
// não estiverem lá, o deploy NÃO acontece.
//
// SEGUNDO INCIDENTE, 06/10/2026: a checagem acima só protege quem passa por
// ESTE script. O globo voltou a ficar com países transparentes porque algum
// deploy saiu ao ar sem passar por aqui — publicado manualmente, por fora. A
// checagem pré-deploy não tem como pegar isso: ela só vê o que o PRÓPRIO script
// exportou, nunca o que outra pessoa publicou de outro jeito. Por isso agora,
// depois de publicar, o script também confere o que journi.expo.app está
// servindo DE VERDADE (scripts/verify-production.cjs) — pega tanto um build
// que deu errado depois da checagem local quanto, rodado à parte via
// `npm run verify:prod`, qualquer deploy feito sem passar por aqui.
//
// Uso:
//   npm run deploy:web            (exporta, verifica, publica e confere o ar)
//   npm run deploy:web -- --dry   (exporta e verifica, sem publicar)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findMissingBundleKeys, REQUIRED_BUNDLE_KEYS } = require('./lib/requiredBundleKeys.cjs');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

// `.env.local` sobrescreve `.env` e guarda os ajustes da máquina de quem
// desenvolve (chaves de teste, localhost). Ele sai do caminho durante o export
// para não vazar para produção, e VOLTA no final — inclusive se algo falhar no
// meio, que é o que o `finally` lá embaixo garante.
const localEnv = path.join(root, '.env.local');
const parkedEnv = path.join(root, '.env.local.deploy-backup');

const run = (command, args) => {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
};

/** O JS do bundle web recém-exportado. */
const readBundle = () => {
  const jsDir = path.join(distDir, '_expo', 'static', 'js', 'web');
  if (!fs.existsSync(jsDir)) throw new Error(`export não gerou ${jsDir}`);

  return fs.readdirSync(jsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => fs.readFileSync(path.join(jsDir, file), 'utf8'))
    .join('\n');
};

const verifyBundle = () => {
  const bundle = readBundle();
  const missing = findMissingBundleKeys(bundle);

  if (!missing.length) {
    console.log(`\n✓ bundle verificado: ${REQUIRED_BUNDLE_KEYS.map((entry) => entry.name).join(', ')}`);
    return;
  }

  // A dica importa: quem vê este erro precisa saber que o problema é o ambiente
  // do build, não o código.
  throw new Error(
    `O bundle saiu SEM estas variáveis: ${missing.map((entry) => entry.name).join(', ')}.\n`
    + 'O `expo export` não leu nenhum arquivo .env. Confira se .env existe na raiz\n'
    + 'do projeto e se ele não foi movido para fora durante o processo.\n'
    + 'NADA foi publicado.'
  );
};

/**
 * Confere o que journi.expo.app está servindo DE VERDADE, depois de publicar.
 * Dá um tempo para a CDN assentar — um deploy do EAS às vezes demora alguns
 * segundos para a URL de produção começar a devolver o bundle novo.
 */
const verifyLiveProduction = async () => {
  const SITE_URL = 'https://journi.expo.app';
  const MAX_ATTEMPTS = 4;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const html = await (await fetch(SITE_URL)).text();
      const bundlePaths = [...new Set(
        [...html.matchAll(/_expo\/static\/js\/web\/[^"'\s]+\.js/g)].map((m) => m[0])
      )];
      if (!bundlePaths.length) throw new Error('a página publicada não referencia nenhum bundle');

      const bundleSource = (
        await Promise.all(bundlePaths.map((p) => fetch(`${SITE_URL}/${p}`).then((r) => r.text())))
      ).join('\n');

      const missing = findMissingBundleKeys(bundleSource);
      if (missing.length) {
        throw new Error(`o que está no ar está SEM: ${missing.map((entry) => entry.name).join(', ')}`);
      }

      console.log(`✓ produção confirmada no ar com as chaves certas (${SITE_URL})`);
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        // Não desfaz o deploy — só avisa alto. Nesta hora o publicado já está
        // no ar; desfazer é decisão de quem está rodando o script, não deste.
        console.error(
          `\n⚠ PUBLICADO, mas a conferência pós-deploy falhou: ${error.message}\n`
          + 'Confira https://journi.expo.app/ na mão antes de considerar isto resolvido.'
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

const main = async () => {
  const dryRun = process.argv.includes('--dry');
  const parked = fs.existsSync(localEnv);

  if (parked) {
    fs.renameSync(localEnv, parkedEnv);
    console.log('• .env.local guardado durante o export');
  }

  try {
    run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist', '--clear']);
    verifyBundle();

    if (dryRun) {
      console.log('\n--dry: export verificado, nada publicado.');
      return;
    }

    run('npx', ['eas-cli@latest', 'deploy', '--prod']);
    console.log('\n✓ publicado. Confira https://journi.expo.app/');

    console.log('\nConferindo o que está no ar...');
    await verifyLiveProduction();
  } finally {
    // SEMPRE: uma falha no meio não pode custar os overrides locais de quem
    // rodou o script.
    if (parked && fs.existsSync(parkedEnv)) {
      fs.renameSync(parkedEnv, localEnv);
      console.log('• .env.local restaurado');
    }
  }
};

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
});
