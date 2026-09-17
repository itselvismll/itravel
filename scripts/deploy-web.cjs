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
// Uso:
//   npm run deploy:web            (exporta, verifica e publica em produção)
//   npm run deploy:web -- --dry   (exporta e verifica, sem publicar)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

// `.env.local` sobrescreve `.env` e guarda os ajustes da máquina de quem
// desenvolve (chaves de teste, localhost). Ele sai do caminho durante o export
// para não vazar para produção, e VOLTA no final — inclusive se algo falhar no
// meio, que é o que o `finally` lá embaixo garante.
const localEnv = path.join(root, '.env.local');
const parkedEnv = path.join(root, '.env.local.deploy-backup');

/**
 * O que o bundle publicado precisa conter.
 *
 * Não é a lista de tudo que existe: é a lista do que, faltando, quebra o app
 * inteiro ou uma tela inteira. Cada entrada traz como o valor APARECE no bundle
 * minificado, que é o que dá para verificar de fora.
 */
const REQUIRED = [
  { name: 'EXPO_PUBLIC_SUPABASE_URL', pattern: /SUPABASE_URL:"https:\/\/[a-z0-9]+\.supabase\.co"/ },
  { name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', pattern: /SUPABASE_ANON_KEY:"ey[A-Za-z0-9._-]{20,}"/ },
  { name: 'EXPO_PUBLIC_MAPBOX_TOKEN', pattern: /MAPBOX_TOKEN:"pk\.[A-Za-z0-9._-]{20,}"/ },
];

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
  const missing = REQUIRED.filter((entry) => !entry.pattern.test(bundle));

  if (!missing.length) {
    console.log(`\n✓ bundle verificado: ${REQUIRED.map((entry) => entry.name).join(', ')}`);
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

const main = () => {
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
  } finally {
    // SEMPRE: uma falha no meio não pode custar os overrides locais de quem
    // rodou o script.
    if (parked && fs.existsSync(parkedEnv)) {
      fs.renameSync(parkedEnv, localEnv);
      console.log('• .env.local restaurado');
    }
  }
};

try {
  main();
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exit(1);
}
