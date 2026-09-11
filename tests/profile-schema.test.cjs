// Todo campo que o app grava em `profiles` tem coluna versionada?
//
// O BUG QUE ISTO PEGA
//
// A coluna `bio` foi usada pelo app sem nunca ter sido criada por migração
// nenhuma. O defeito ficou invisível por semanas porque nenhuma tela ESCREVIA
// nela — apareceu só quando a edição de perfil passou a gravar, e aí como
// "Could not find the 'bio' column of 'profiles' in the schema cache".
//
// A mesma armadilha já tinha mordido antes: a migração
// 20260823120000_fix_handle_new_user_columns existe porque o trigger de cadastro
// passou a inserir em `full_name` e `bio`, que não existiam, e todo signup novo
// quebrou com 42703. Duas vezes o mesmo erro — daí este teste.
//
// A regra: um campo novo em `allowedFields` sem migração correspondente reprova
// AQUI, e não em produção na primeira vez que alguém tentar salvar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');

// Comentário de migração fala MUITO de coluna: o cabeçalho da própria
// 20260910120000_profiles_bio cita `bio` e `full_name` várias vezes para
// explicar a história. Sem tirar os comentários, o parser "encontraria" colunas
// que ninguém criou — exatamente o tipo de falso positivo que faria este teste
// dar uma segurança que ele não tem.
const stripSqlComments = (sql) => sql
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/--[^\n]*/g, '');

/**
 * Colunas de public.profiles declaradas nas migrações versionadas.
 *
 * Cobre as duas formas que criam coluna:
 *   alter table public.profiles add column [if not exists] <nome> <tipo>
 *   create table [if not exists] public.profiles ( <nome> <tipo>, ... )
 *
 * O `add constraint` / `drop constraint` / `enable row level security` ficam de
 * fora porque não declaram coluna — a migração da bio tem quatro `alter table
 * public.profiles` e só um deles cria algo.
 */
const versionedProfileColumns = () => {
  const columns = new Set();

  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'))) {
    const sql = stripSqlComments(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));

    // ALTER TABLE ... ADD COLUMN. O `[\s\S]*?` cobre a quebra de linha entre o
    // `alter table public.profiles` e o `add column` da linha seguinte, que é
    // como as migrações deste projeto são escritas.
    const alterPattern =
      /alter\s+table\s+(?:only\s+)?(?:public\.)?profiles\b([\s\S]*?);/gi;
    for (const statement of sql.matchAll(alterPattern)) {
      const addColumn = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
      for (const match of statement[1].matchAll(addColumn)) {
        columns.add(match[1].toLowerCase());
      }
    }

    // CREATE TABLE. Não existe hoje (ver o teste do baseline abaixo), mas se
    // alguém versionar a tabela um dia, o parser precisa enxergar.
    const createPattern =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?profiles\s*\(([\s\S]*?)\n\s*\)\s*;/gi;
    for (const statement of sql.matchAll(createPattern)) {
      for (const line of statement[1].split('\n')) {
        const definition = line.trim();
        // Pula constraint de tabela (primary key, unique, foreign key, check…),
        // que não é definição de coluna.
        //
        // `references|on|deferrable|initially` estão aqui porque um constraint
        // pode ocupar VÁRIAS linhas, e a continuação começa com uma dessas
        // palavras — sem elas o parser lia "references" (de `references
        // auth.users (id) on delete cascade`) como se fosse uma coluna chamada
        // "references".
        if (
          /^(constraint|primary|unique|foreign|check|exclude|references|on|deferrable|initially|not|default)\b/i
            .test(definition)
        ) continue;
        const match = definition.match(/^"?([a-z_][a-z0-9_]*)"?\s+\S/i);
        if (match) columns.add(match[1].toLowerCase());
      }
    }
  }

  return columns;
};

/** Os campos que updateProfile aceita gravar. */
const appProfileFields = () => {
  const service = fs.readFileSync(path.join(root, 'src/services/profileService.js'), 'utf8');
  const match = service.match(/allowedFields\s*=\s*\[([^\]]*)\]/);
  assert.ok(match, 'não achei allowedFields em profileService.js');

  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
};

// ─────────────────────────────────────────────────────────────────────────────
// O BASELINE NÃO VERSIONADO — hoje VAZIO, e é assim que deve ficar.
//
// Esta lista existiu enquanto a tabela `profiles` não tinha `create table` em
// migração nenhuma: id, username, display_name e avatar_url existiam em produção
// sem declaração no repositório. Ela era a dívida escrita por extenso.
//
// A dívida foi paga por 20260720180000_baseline_profiles.sql, que versiona a
// tabela inteira — daí a lista ter esvaziado. Manter a constante (em vez de
// apagá-la) preserva o teste abaixo, que é o que impede alguém de reabrir a
// dívida colocando um nome aqui em vez de escrever a migração.
// ─────────────────────────────────────────────────────────────────────────────
const UNVERSIONED_BASELINE = [];

test('todo campo gravável do app tem coluna versionada (ou está no baseline conhecido)', () => {
  const versioned = versionedProfileColumns();
  const known = new Set([...versioned, ...UNVERSIONED_BASELINE]);

  const missing = appProfileFields().filter((field) => !known.has(field));

  assert.deepEqual(
    missing,
    [],
    `campos de allowedFields sem coluna versionada nem baseline: ${missing.join(', ')}. ` +
      'Crie uma migração em supabase/migrations com `alter table public.profiles ' +
      'add column if not exists <campo> <tipo>` antes de gravar neste campo.'
  );
});

test('o parser realmente enxerga as colunas versionadas', () => {
  // Um parser quebrado passaria o teste acima em silêncio, porque um conjunto
  // vazio de colunas versionadas + o baseline ainda cobre os campos de hoje.
  // Estas âncoras garantem que ele está lendo de verdade.
  const versioned = versionedProfileColumns();

  assert.ok(versioned.has('bio'), 'não leu a coluna bio da migração 20260910120000');
  assert.ok(versioned.has('onboarding_completed'), 'não leu onboarding_completed');
  assert.ok(versioned.has('username_confirmed'), 'não leu username_confirmed');

  // E não inventa colunas a partir de comentário: `full_name` é citada várias
  // vezes nos comentários das migrações justamente por NÃO existir.
  assert.ok(
    !versioned.has('full_name'),
    'o parser leu `full_name` de um comentário — os comentários não estão sendo removidos'
  );

  // Nem inventa coluna a partir de linha de constraint. `references` é a
  // continuação da FK do baseline (`references auth.users (id) ...`) e já foi
  // lida como coluna uma vez.
  for (const palavra of ['references', 'constraint', 'primary', 'foreign', 'on']) {
    assert.ok(
      !versioned.has(palavra),
      `o parser leu "${palavra}" como coluna — é linha de constraint, não de coluna`
    );
  }

  // O baseline versiona a tabela inteira: estas são as colunas reais de
  // produção, verificadas na API.
  for (const coluna of ['id', 'username', 'display_name', 'avatar_url', 'phone',
    'created_at', 'updated_at']) {
    assert.ok(versioned.has(coluna), `o baseline não declara a coluna ${coluna}`);
  }
});

test('o baseline não versionado não cresce sozinho', () => {
  // Se alguém adicionar um campo ao app e "resolver" a falha metendo o nome
  // aqui em vez de escrever a migração, isto reprova.
  assert.deepEqual(
    UNVERSIONED_BASELINE,
    [],
    'o baseline precisa continuar vazio: a tabela profiles é versionada desde ' +
      '20260720180000_baseline_profiles.sql. Campo novo do app precisa de migração, ' +
      'não de uma entrada aqui.'
  );

  // Nenhuma coluna do baseline pode estar versionada ao mesmo tempo: se estiver,
  // a dívida foi paga e a entrada tem de sair da lista.
  const versioned = versionedProfileColumns();
  const jaVersionadas = UNVERSIONED_BASELINE.filter((column) => versioned.has(column));
  assert.deepEqual(
    jaVersionadas,
    [],
    `estas colunas já têm migração e devem sair do baseline: ${jaVersionadas.join(', ')}`
  );
});
