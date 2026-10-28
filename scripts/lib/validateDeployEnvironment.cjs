// Decisão pura usada por `app.config.js` (avaliado pelo próprio Expo CLI, em
// TODO `expo export`/`expo start`/`eas build`, não só por quem passa pelos
// scripts npm) e testada por `tests/validate-deploy-environment.test.cjs` sem
// precisar spawnar um processo nem tocar `process.exit`.
//
// Separada do arquivo que chama `process.exit` de propósito: um teste que
// `require`asse `app.config.js` diretamente mataria o próprio test runner no
// primeiro cenário de falha.
//
// FALHA ABERTA, E POR QUE ISTO IMPORTA MAIS AQUI DO QUE em outro `if`
// qualquer: esta função decide se a trava DURA entra em jogo. Se ela deixar
// de reconhecer uma forma válida de pedir um export web, o resultado não é
// "um erro chamativo em outro lugar" -- é o export rodando sem trava
// nenhuma, em silêncio, exatamente o modo de falha que esta trava existe
// para eliminar. Por isso `isWebProductionExport` trata a AUSÊNCIA de
// `--platform` como produção (é o default do Expo, `all`, que inclui web)
// em vez de como "não detectei, então deixa passar".
const { REQUIRED_ENV_VARS } = require('../check-build-env.cjs');

// As duas formas da flag (`npx expo export --help`: "-p, --platform
// <platform>. Options: android, ios, web, tvos, macos, all. Default: all").
const PLATFORM_FLAGS = ['--platform', '-p'];

// Qualquer valor de plataforma que PRODUZ um bundle web. `all` é o default
// quando a flag não aparece — confirmado rodando `expo export` sem
// `--platform` neste projeto: ele gera `_expo/static/js/web/index-*.js`
// igual a `--platform web`, com o mesmo `EXPO_PUBLIC_MAPBOX_TOKEN` embutido.
// Então "sem flag" tem que ser tratado como risco de produção, não como
// "não é web".
const WEB_PRODUCING_PLATFORMS = new Set(['web', 'all']);

/**
 * O valor passado para `--platform`/`-p`, cobrindo as formas equivalentes
 * confirmadas contra o `@expo/cli` real deste projeto:
 *
 *   • `--platform web` / `-p web`        (espaço, forma documentada)
 *   • `--platform=web`                   (igual — aceito pelo parser do
 *     Expo; `-p=web` NÃO é: o Expo recusa com "option requires argument"
 *     antes de exportar qualquer coisa, então não é um caminho de risco)
 *   • `--platform web,ios`               (lista por vírgula — o Expo HOJE
 *     recusa com `CommandError: Unsupported platform "web,ios"` antes de
 *     bundlar qualquer coisa, então também não é risco; tratamos mesmo
 *     assim, por segurança contra uma versão futura que passe a aceitar)
 *   • nenhuma flag                       (default `all`, ver acima)
 *
 * @param {string[]} argv
 * @returns {string | null} o valor em minúsculas, ou `null` se a flag não
 *   apareceu (default `all`, tratado separadamente em `isWebProductionExport`)
 */
const platformArgValue = (argv) => {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    const equalsMatch = /^(?:--platform|-p)=(.+)$/.exec(token);
    if (equalsMatch) return equalsMatch[1].toLowerCase();

    if (PLATFORM_FLAGS.includes(token)) {
      const value = argv[index + 1];
      // `--platform` sem valor nenhum (ex.: seguido de outra flag, ou
      // último token) é erro do próprio Expo, não um export de verdade.
      return value && !value.startsWith('-') ? value.toLowerCase() : null;
    }
  }
  return null;
};

/**
 * @param {string[]} argv ex.: `process.argv`
 * @returns {boolean} true para qualquer `expo export` cujo resultado inclua
 *   um bundle web — o único export que este projeto publica. Isto cobre
 *   `--platform web`, `-p web`, `--platform=web`, uma lista que contenha
 *   `web` ou `all`, e a AUSÊNCIA da flag (default `all`). Qualquer outro
 *   caminho (`expo start`, build de preview, build nativo para android/ios
 *   isolado) é tolerante por design.
 */
const isWebProductionExport = (argv) => {
  if (!argv.includes('export')) return false;

  const platformValue = platformArgValue(argv);
  if (platformValue === null) return true; // sem flag => default `all`

  return platformValue
    .split(',')
    .map((value) => value.trim())
    .some((value) => WEB_PRODUCING_PLATFORMS.has(value));
};

/**
 * @param {{
 *   argv: string[],
 *   effectiveEnv: Record<string, string | undefined>,
 *   productionToken: string | null,
 * }} input
 * @returns {{ level: 'ok' | 'warn' | 'fail', message?: string }}
 */
const validateDeployEnvironment = ({ argv, effectiveEnv, productionToken }) => {
  const isProduction = isWebProductionExport(argv);
  const missing = REQUIRED_ENV_VARS.filter((name) => !effectiveEnv[name]);

  if (missing.length) {
    if (isProduction) {
      return {
        level: 'fail',
        message: `Export de produção para web sem variáveis obrigatórias: ${missing.join(', ')}.\n`
          + 'Confira se .env existe na raiz do projeto e tem estas chaves preenchidas.\n'
          + 'NADA foi exportado.',
      };
    }
    return {
      level: 'warn',
      message: `faltam estas variáveis obrigatórias: ${missing.join(', ')}. `
        + 'Ok em desenvolvimento/preview; produção para web exige todas.',
    };
  }

  // O VAZAMENTO SILENCIOSO: o Expo carrega `.env.local` sobrepondo `.env` --
  // inclusive num export de produção. Se `.env.local` tiver um token do
  // Mapbox (o token SEM restrição de URL, para localhost), ele vence o
  // token restrito de `.env` e vai para o bundle público. O app sai do ar
  // funcionando perfeitamente; o problema é só o token exposto sem proteção
  // de domínio, usável a partir de qualquer site. Isto só importa no export
  // de produção -- em dev/preview, o token sem restrição é o esperado.
  if (isProduction) {
    const effectiveToken = effectiveEnv.EXPO_PUBLIC_MAPBOX_TOKEN;
    if (productionToken && effectiveToken && productionToken !== effectiveToken) {
      return {
        level: 'fail',
        message: 'EXPO_PUBLIC_MAPBOX_TOKEN efetivo não é o valor declarado em .env --\n'
          + 'o export provavelmente pegou o token SEM restrição de .env.local, que o\n'
          + 'Expo sobrepõe a .env. Esse token não pode ir para produção: sem restrição\n'
          + 'de domínio, qualquer site pode usá-lo e queimar a cota da conta.\n\n'
          + 'Remova ou renomeie .env.local antes de exportar para produção (ou use\n'
          + '`eas env:pull production` para trazer as variáveis certas do painel da\n'
          + 'EAS em vez de depender do estado desta máquina). NADA foi exportado.',
      };
    }
  }

  return { level: 'ok' };
};

module.exports = { isWebProductionExport, validateDeployEnvironment };
