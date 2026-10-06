// Um Postgres de verdade para os testes de migração.
//
// POR QUE ISTO EXISTE
//
// Os testes de SQL deste projeto eram todos TEXTUAIS: liam o arquivo da migração e
// afirmavam que certa frase estava escrita nele (ver `tests/trip-tasks.test.cjs`).
// Isso pega o esquecimento — alguém tirou o `security definer` — mas não pega o
// que importa num trigger de filtro: se ele de fato descarta a linha, se olha o
// destinatário certo, se `all_enabled` preserva as colunas. Um `return null` no
// galho errado passa em qualquer teste de texto.
//
// PGlite é o Postgres compilado para WASM: plpgsql, `to_jsonb`, trigger BEFORE
// INSERT e RLS funcionando, sem servidor para subir e sem Docker. Roda no
// `node:test` como qualquer outro arquivo.
//
// O QUE ESTE HELPER MONTA
//
// O MÍNIMO para a migração em teste rodar — não o esquema do app. Um `auth.users`
// de mentira (só o `id`, que é o alvo da FK), e a `notifications` com as colunas
// que os triggers existentes usam. Reproduzir o esquema inteiro aqui criaria uma
// segunda verdade sobre o banco, que envelheceria calada; o que vale é a migração
// sob teste, lida do arquivo real.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

/**
 * O esqueleto que precede a migração sob teste.
 *
 * `notifications` nasce aqui com o mesmo `check` de tipo que a migração
 * 20260923140000 deixou em produção, para o teste não conseguir inserir um tipo
 * que o banco real recusaria.
 */
const SCHEMA_BASE = `
  -- Os papéis que o Supabase cria e que as migrações citam em "to authenticated".
  -- PGlite é Postgres puro: sem eles, a primeira policy derruba a migração com
  -- 'role "authenticated" does not exist', e o teste morreria antes de chegar ao
  -- que ele quer medir.
  create role anon;
  create role authenticated;
  create role service_role;

  create schema if not exists auth;

  create table auth.users (
    id uuid primary key
  );

  -- auth.uid() lê um GUC em vez do JWT. É assim que se testa RLS sem GoTrue:
  -- 'set local request.jwt.claim.sub' faz o papel do token. As policies da
  -- migração são escritas contra esta assinatura e não sabem a diferença.
  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $fn$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $fn$;

  create table public.notifications (
    id bigint generated always as identity primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    actor_id uuid references auth.users(id) on delete cascade,
    type text not null,
    message text,
    read boolean not null default false,
    photo_id uuid,
    target_id text,
    preview text,
    -- A coluna e a FK vêm da 20260807193000 e NUNCA foram removidas, nem quando a
    -- 20260812130000 tirou o tipo 'message' do check. É o que permitiu devolver o
    -- aviso de DM sem mexer no esquema. A FK entra no bloco de mensageria abaixo,
    -- quando conversations já existe — a mesma ordem da migração real.
    conversation_id uuid,
    created_at timestamptz not null default now(),
    constraint notifications_type_check check (type in (
      'follow', 'comment', 'like',
      'trip_invite', 'trip_joined', 'trip_edit',
      'trip_task_created', 'trip_task_done'
    ))
  );
`;

// As conversas, os passaportes compartilhados, o bloqueio e os dois helpers que
// os triggers de mensagem direta e de passaporte chamam. Ficam num bloco separado porque só o teste de DM precisa deles — mas
// são aplicados sempre: 'create table' não custa nada e um esquema por teste
// seria uma segunda verdade a manter.
//
// `is_blocked_either_way` e `is_conversation_participant` são COPIADAS das
// migrações que as definem (20260914170000 e 20260805190000). Copiar é o custo
// de testar uma migração isolada: ela depende de funções que vivem em arquivos
// anteriores, e aplicar a cadeia inteira aqui arrastaria o esquema do app todo.
// As cópias são curtas e estáveis; se uma delas mudar de comportamento, o teste
// de DM é que vai ficar otimista — por isso a nota.
const SCHEMA_MESSAGING = `
  create table public.conversations (
    id uuid primary key default gen_random_uuid(),
    created_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now()
  );

  create table public.conversation_participants (
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    primary key (conversation_id, user_id)
  );

  create table public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_id uuid not null references auth.users(id) on delete cascade,
    body text,
    shared_photo jsonb,
    shared_plan jsonb,
    shared_passport_id uuid,
    shared_passport jsonb,
    read_at timestamptz,
    created_at timestamptz not null default now()
  );

  create table public.passport_shares (
    id uuid primary key default gen_random_uuid(),
    sender_id uuid not null references auth.users(id) on delete cascade,
    recipient_id uuid not null references auth.users(id) on delete cascade,
    snapshot jsonb not null,
    created_at timestamptz not null default now(),
    check (sender_id <> recipient_id)
  );

  alter table public.messages
    add constraint messages_shared_passport_id_fkey
    foreign key (shared_passport_id) references public.passport_shares(id) on delete set null;

  alter table public.notifications
    add column passport_share_id uuid references public.passport_shares(id) on delete cascade;

  create table public.blocked_users (
    blocker_id uuid not null references auth.users(id) on delete cascade,
    blocked_id uuid not null references auth.users(id) on delete cascade,
    primary key (blocker_id, blocked_id)
  );

  alter table public.notifications
    add constraint notifications_conversation_id_fkey
    foreign key (conversation_id) references public.conversations(id) on delete cascade;

  create or replace function public.is_blocked_either_way(user_a uuid, user_b uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
  as $fn$
    select case
      when user_a is null or user_b is null then false
      else exists (
        select 1 from public.blocked_users b
        where (b.blocker_id = user_a and b.blocked_id = user_b)
           or (b.blocker_id = user_b and b.blocked_id = user_a)
      )
    end;
  $fn$;

  create or replace function public.is_conversation_participant(conversation_uuid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
  as $fn$
    select exists (
      select 1 from public.conversation_participants
      where conversation_id = conversation_uuid and user_id = auth.uid()
    );
  $fn$;
`;

/**
 * Sobe um Postgres, cria o esqueleto e aplica a migração pedida.
 *
 * A migração é lida do arquivo de verdade, em `supabase/migrations/`: é esse
 * arquivo que vai para produção, e um teste que rodasse uma cópia colada aqui não
 * provaria nada sobre ele.
 *
 * O tipo de retorno lista só o que os testes usam, e não `PGlite`: o tipo público
 * do pacote declara campos privados e `PGlite.create()` devolve uma interseção que
 * o `tsc` recusa como o próprio PGlite. Prometer a superfície usada é honesto e
 * compila.
 *
 * @param {string} migrationFile nome do arquivo em supabase/migrations
 * @returns {Promise<{
 *   query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>,
 *   exec: (sql: string) => Promise<unknown>,
 *   close: () => Promise<void>,
 * }>}
 */
const createDbWithMigration = async (migrationFile) => {
  // `import()` e não `require()`: o pacote é ESM, e este arquivo é .cjs como o
  // resto dos testes.
  const { PGlite } = await import('@electric-sql/pglite');
  const db = await PGlite.create();

  await db.exec(SCHEMA_BASE);
  await db.exec(SCHEMA_MESSAGING);
  await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', migrationFile), 'utf8'));

  return db;
};

/** Cria usuários de mentira. A FK de `notifications.user_id` cobra que existam. */
const insertUsers = async (db, ids) => {
  for (const id of ids) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
  }
};

module.exports = { SCHEMA_BASE, SCHEMA_MESSAGING, createDbWithMigration, insertUsers };
