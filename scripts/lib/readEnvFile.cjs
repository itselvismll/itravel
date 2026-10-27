// Lê KEY=value de um .env sem depender de dotenv (o projeto não tem).
//
// Compartilhado entre scripts/check-build-env.cjs e scripts/backup-tables.cjs
// -- os dois precisam da mesma leitura, e o bug abaixo já aconteceu uma vez
// num dos dois.
const fs = require('fs');
const path = require('path');

/** Lê um arquivo .env isolado. Arquivo ausente devolve objeto vazio, nunca erro. */
const readEnvFile = (root, file) => {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  // Separar por /\r?\n/, e não por '\n'.
  //
  // Os .env desta máquina são CRLF, e em JavaScript o `.` de uma regex NÃO casa
  // \r -- ele é terminador de linha, como \n. Então `(.*)$` parava antes do \r,
  // o `$` não chegava ao fim da string, e a linha inteira era descartada em
  // silêncio: o script morria dizendo "variável ausente" com ela escrita no
  // arquivo, bem na frente dele.
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
};

/**
 * O ambiente efetivo de um export do Expo, na mesma precedência documentada
 * em .env.example: process.env (variável já exportada no shell/CI) vence
 * tudo, depois `.env.local` vence `.env`.
 */
const loadEffectiveEnv = (root) => {
  const fileEnv = { ...readEnvFile(root, '.env'), ...readEnvFile(root, '.env.local') };
  return { ...fileEnv, ...process.env };
};

module.exports = { readEnvFile, loadEffectiveEnv };
