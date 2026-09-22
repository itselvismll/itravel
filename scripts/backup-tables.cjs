#!/usr/bin/env node
//
// Exporta as tabelas criticas da viagem colaborativa para JSON local.
//
// ===========================================================================
//  ISTO NAO E UM BACKUP DO BANCO.  E um despejo dos DADOS de um punhado de
//  tabelas, pela API REST. Nao guarda schema, indices, policies, functions,
//  triggers, sequences, extensoes, storage, nem os usuarios em auth.users.
//  Serve para UMA coisa: se uma migration corromper ou apagar linhas, da para
//  repor essas linhas a mao. Restaurar nao e automatico.
// ===========================================================================
//
// POR QUE ELE EXISTE
//
// O plano Free do Supabase nao tem backup pelo painel (so o Pro tem), e esta
// maquina nao tem Docker nem pg_dump. Sem isto, aplicar as migrations da Fase 2
// em producao seria um passo sem rede de seguranca nenhuma.
//
// AS DUAS COISAS QUE UM SCRIPT DESTES ERRA EM SILENCIO
//
// 1. PAGINACAO. O PostgREST devolve no maximo 1000 linhas por requisicao. Um
//    `select('*')` ingenuo numa tabela de 4000 linhas retorna 1000, com HTTP
//    200 e sem aviso nenhum -- e o "backup" nasce com 75% dos dados faltando,
//    parecendo integro. Aqui as paginas sao percorridas ate a ultima.
//
// 2. ORDENACAO INSTAVEL. Paginar sem ORDER BY deixa a ordem das linhas a cargo
//    do Postgres, que pode repetir uma linha numa pagina e pular outra. Cada
//    tabela abaixo declara a propria chave de ordenacao -- `trip_members` nao
//    tem coluna `id` (a PK e composta), entao ordenar tudo por `id` quebraria
//    justamente a tabela que diz quem participa de que.
//
// Uso:
//   npm run backup:db           exporta
//   npm run backup:db -- --dry  conecta, conta as linhas e nao grava nada
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
const dry = process.argv.includes('--dry');

// As tabelas, e o motivo de cada uma estar aqui.
//
// O criterio e o que as migrations pendentes tocam -- por ALTER, por trigger
// novo, ou por constraint reescrita. `orderBy` e a chave de paginacao estavel.
const TABLES = [
  // ALTER: ganha a coluna last_edited_by (20260917130000).
  { name: 'trip_days', orderBy: ['id'] },
  // ALTER: ganha last_edited_by, e e o alvo do sync_trip_itinerary -- a tabela
  // com mais linhas e a que mais tem a perder se o sync sair errado.
  { name: 'trip_activities', orderBy: ['id'] },
  // A constraint notifications_type_check e DROPADA e recriada com os tres
  // tipos de viagem. Linha com tipo fora da lista nova faria a recriacao falhar.
  { name: 'notifications', orderBy: ['id'] },
  // Ganha o trigger log_trip_plan_data_edit, que escreve em trip_edit_log a
  // cada UPDATE de plan_data.
  { name: 'travel_plans', orderBy: ['id'] },
  // Ganha o trigger notify_trip_membership. PK composta: sem coluna `id`.
  { name: 'trip_members', orderBy: ['trip_id', 'user_id'] },
  // Alvo das FKs last_edited_by. Nao e alterada, mas repor trip_activities sem
  // os profiles correspondentes daria violacao de FK na restauracao.
  { name: 'profiles', orderBy: ['id'] },
  // Ainda nao existem -- sao CRIADAS pelas migrations. Ficam na lista para que
  // rodar o script DEPOIS de aplicar ja as inclua. Ausente nao e erro.
  { name: 'trip_invites', orderBy: ['id'], optional: true },
  { name: 'trip_edit_log', orderBy: ['id'], optional: true },
];

const PAGE_SIZE = 1000;

/** Le KEY=value de um .env sem depender de dotenv (o projeto nao tem). */
const readEnvFile = (file) => {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  // Separar por /\r?\n/, e nao por '\n'.
  //
  // Os .env desta maquina sao CRLF, e em JavaScript o `.` de uma regex NAO casa
  // \r -- ele e terminador de linha, como \n. Entao `(.*)$` parava antes do \r,
  // o `$` nao chegava ao fim da string, e a linha inteira era descartada em
  // silencio: o script morria dizendo "SUPABASE_URL ausente" com a URL escrita
  // no arquivo, bem na frente dele.
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
};

// process.env vence o arquivo, e .env.local vence .env -- a mesma precedencia
// que o resto do projeto usa.
const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
const env = (key) => process.env[key] || fileEnv[key];

const url = env('SUPABASE_URL') || env('EXPO_PUBLIC_SUPABASE_URL');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

const fail = (message) => {
  console.error(`\n  x ${message}\n`);
  process.exit(1);
};

if (!url) fail('SUPABASE_URL ausente. Esperado em .env como EXPO_PUBLIC_SUPABASE_URL.');

if (!serviceKey) {
  fail(
    'SUPABASE_SERVICE_ROLE_KEY ausente.\n\n'
    + '    Pegue em: Supabase -> Project Settings -> API -> service_role (secret)\n'
    + '    e acrescente ao .env.local (que ja e ignorado pelo git):\n\n'
    + '      SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n'
    + '    A anon key NAO serve: a RLS esconde dela as linhas de todo mundo, e o\n'
    + '    backup sairia vazio parecendo bem-sucedido.'
  );
}

// GUARDA DE VAZAMENTO, e ela nao e teorica.
//
// Tudo que se chama EXPO_PUBLIC_* e inlinado no bundle web pelo expo export e
// vai a publico em journi.expo.app. A service role key ignora RLS inteira: no
// bundle, ela e acesso total de leitura e escrita ao banco para quem abrir o
// DevTools. O nome sem prefixo e o que a mantem fora do build.
const leakedName = Object.keys({ ...process.env, ...fileEnv }).find(
  (key) => key.startsWith('EXPO_PUBLIC_') && /SERVICE_ROLE/i.test(key)
);

if (leakedName) {
  fail(
    `A variavel ${leakedName} esta definida.\n\n`
    + '    Renomeie para SUPABASE_SERVICE_ROLE_KEY antes de continuar: tudo que\n'
    + '    comeca com EXPO_PUBLIC_ entra no bundle web publicado, e a service\n'
    + '    role key ignora a RLS -- publica-la e entregar o banco inteiro.'
  );
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Busca a tabela inteira, pagina a pagina. Devolve null se ela nao existe.
 *
 * @param {{ name: string, orderBy: string[], optional?: boolean }} table
 * @returns {Promise<Array<Record<string, unknown>> | null>}
 */
const fetchAll = async ({ name, orderBy, optional }) => {
  const rows = [];

  for (let page = 0; ; page += 1) {
    let query = supabase.from(name).select('*');
    for (const column of orderBy) query = query.order(column, { ascending: true });

    const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      // PGRST205 = tabela inexistente. Para as que as migrations vao criar,
      // isso e o esperado; para as outras, e falha.
      if (optional && (error.code === 'PGRST205' || /does not exist/i.test(error.message))) {
        return null;
      }
      fail(`Falhou ao ler ${name}: ${error.message} (${error.code || 'sem codigo'})`);
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
};

const main = async () => {
  // Nome de diretorio com timestamp: 2026-09-21T14-32-05Z. Sem ':', que o
  // Windows nao aceita em nome de arquivo.
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  const outDir = path.join(root, 'backups', stamp);

  console.log(`\n  Backup de dados -- ${url}`);
  console.log(`  ${dry ? 'MODO DRY: nada sera gravado' : `destino: backups/${stamp}/`}\n`);

  const manifest = { takenAt: new Date().toISOString(), url, tables: {} };
  let totalRows = 0;
  const empty = [];

  if (!dry) fs.mkdirSync(outDir, { recursive: true });

  for (const table of TABLES) {
    const rows = await fetchAll(table);

    if (rows === null) {
      console.log(`  o ${table.name.padEnd(18)} nao existe ainda (sera criada pelas migrations)`);
      manifest.tables[table.name] = { exists: false, rows: 0 };
      continue;
    }

    if (!dry) {
      fs.writeFileSync(
        path.join(outDir, `${table.name}.json`),
        JSON.stringify(rows, null, 2),
        'utf8'
      );
    }

    totalRows += rows.length;
    if (rows.length === 0) empty.push(table.name);
    manifest.tables[table.name] = { exists: true, rows: rows.length };
    console.log(
      `  ${rows.length === 0 ? '!' : 'v'} ${table.name.padEnd(18)} `
      + `${String(rows.length).padStart(6)} linha(s)`
    );
  }

  if (!dry) {
    fs.writeFileSync(
      path.join(outDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
  }

  console.log(`\n  Total: ${totalRows} linha(s).`);

  // Tabela vazia PODE ser verdade (ninguem criou notificacao ainda) ou pode ser
  // a service role key errada, ou a URL de outro projeto. O script nao tem como
  // distinguir -- entao ele nao afirma que esta tudo bem, ele aponta.
  if (empty.length) {
    console.log(`\n  ! Vieram VAZIAS: ${empty.join(', ')}`);
    console.log('    Confira se isso bate com a realidade antes de aplicar qualquer migration.');
  }

  // Um backup que nao trouxe NADA de lugar nenhum nao e um backup -- e um erro
  // de configuracao que ainda nao se apresentou. Sair com codigo 1 impede que
  // ele seja encadeado com um `&& aplicar-migrations`.
  if (totalRows === 0) {
    fail(
      'Nenhuma linha em nenhuma tabela. Isto nao e um backup -- provavelmente a\n'
      + '    chave ou a URL estao erradas. NAO aplique migrations com base nisto.'
    );
  }

  if (!dry) console.log(`\n  Gravado em backups/${stamp}/\n`);
};

main().catch((error) => fail(error?.message || String(error)));
