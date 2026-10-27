// Wrapper de `app.json` que acrescenta uma trava de ambiente — e só isso.
// Toda a configuração do app continua em `app.json`; este arquivo não muda
// nenhum campo dela, apenas valida o ambiente antes de devolvê-la.
//
// ═══════════════════════════════════════════════════════════════════════════
//  POR QUE A TRAVA PRECISA ESTAR AQUI, E NÃO SÓ NOS SCRIPTS NPM
// ═══════════════════════════════════════════════════════════════════════════
//
// `scripts/check-build-env.cjs` (camada 1) e a comparação de token dentro de
// `scripts/deploy-web.cjs` (camada 2) só rodam para quem usa
// `npm run deploy:web`. Isso NÃO é hipotético: os incidentes de produção já
// registrados (globo sem satélite) saíram exatamente do caminho cru —
//
//     npx expo export --platform web
//     eas deploy --prod
//
// — rodado direto no terminal, de máquinas diferentes, por pessoas
// diferentes. Uma trava que depende de alguém lembrar de usar `npm run
// deploy:web` em vez do comando cru não resolve o problema que a motivou.
//
// `app.config.js` resolve isso porque o Expo CLI o avalia (via `require`, no
// mesmo processo) sempre que lê a configuração do projeto — em
// `expo export`, `expo start`, `eas build` — **independente de como o
// comando foi invocado**. Não tem "esquecer de passar por aqui": é o próprio
// `expo` que executa este arquivo.
//
// NÃO CONFIAR em `process.env` já estar carregado neste ponto: em `expo
// export` (diferente de `expo config`), este arquivo é avaliado ANTES do
// `@expo/env` injetar as variáveis de `.env`/`.env.local` no processo --
// confirmado rodando as duas checagens lado a lado contra o mesmo `.env`
// real: `expo config` via as três variáveis; `expo export --platform web`
// via as três como ausentes. Um gate que dependesse dessa ordem teria
// barrado TODO export, inclusive um com o ambiente certo — pior que não ter
// gate nenhum. Por isso este arquivo lê `.env`/`.env.local` direto do disco,
// com a mesma precedência (`scripts/lib/readEnvFile.cjs`), em vez de confiar
// no que o Expo já deveria ter colocado em `process.env`.
//
// ═══════════════════════════════════════════════════════════════════════════
//  O QUE É DURO, E O QUE É SÓ AVISO
// ═══════════════════════════════════════════════════════════════════════════
//
// A trava DURA (derruba o processo, `process.exit(1)`) só se aplica a um
// export que inclua o bundle web — o único que este projeto publica. Isto
// cobre `--platform web`, `-p web`, `--platform=web`, e a AUSÊNCIA da flag
// (o default do Expo é `all`, que JÁ inclui web — confirmado rodando `expo
// export` sem `--platform` neste projeto). Ver o comentário de
// `isWebProductionExport`, em `validateDeployEnvironment.cjs`, para a lista
// completa de formas cobertas e por quê "não reconheci a flag" tem que
// contar como produção, nunca como "deixa passar". Em qualquer caminho que
// NÃO gere bundle web (`expo start`, build nativo isolado para android/ios)
// — o token SEM restrição de `.env.local` é legítimo e algumas variáveis
// podem faltar sem problema; aqui, no máximo um aviso no terminal, nunca uma
// falha.
//
// A decisão (obrigatória/opcional, duro/aviso) mora em
// `scripts/lib/validateDeployEnvironment.cjs` como função pura — e não aqui
// — porque este arquivo chama `process.exit`, e um teste que o `require`asse
// direto mataria o próprio test runner no primeiro cenário de falha.
// `tests/validate-deploy-environment.test.cjs` cobre a função; aqui só
// chamamos.
const { loadEffectiveEnv } = require('./scripts/lib/readEnvFile.cjs');
const { readProductionMapboxToken } = require('./scripts/lib/verifyMapboxTokenSource.cjs');
const { validateDeployEnvironment } = require('./scripts/lib/validateDeployEnvironment.cjs');

const root = __dirname;

const result = validateDeployEnvironment({
  argv: process.argv,
  effectiveEnv: loadEffectiveEnv(root),
  productionToken: readProductionMapboxToken(root),
});

if (result.level === 'fail') {
  console.error(`\n✗ ${result.message}\n`);
  process.exit(1);
} else if (result.level === 'warn') {
  console.warn(`\n⚠ ${result.message}\n`);
}

// Forma de função: recebe a config já resolvida a partir de `app.json` (mais
// os defaults do CLI) e a devolve sem alterar nenhum campo -- este arquivo
// existe só pela validação acima, avaliada antes deste `return`.
module.exports = ({ config }) => config;
