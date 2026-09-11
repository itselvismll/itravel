-- BASELINE de public.profiles.
--
-- Ajustado a partir da introspecção real do banco de produção. Ver o bloco
-- "PROCEDÊNCIA DE CADA DECISÃO" no fim do arquivo.
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
--
-- A tabela `profiles` nunca foi versionada: não existe `create table
-- public.profiles` em migração nenhuma. As colunas id, username, display_name,
-- avatar_url, phone, created_at e updated_at existem em produção sem nenhuma
-- declaração no repositório — só onboarding_completed, username_confirmed e bio
-- têm migração própria.
--
-- A consequência prática: um ambiente novo criado a partir das migrações NÃO
-- reproduz produção. Ele nem chega a subir — a PRIMEIRA migração do projeto
-- (20260720190000_enable_rls) começa com `alter table public.profiles enable row
-- level security`, que falha numa base onde a tabela não existe.
--
-- POR QUE O TIMESTAMP É ANTERIOR AO DA PRIMEIRA MIGRAÇÃO
--
-- 20260720180000 fica uma hora antes de 20260720190000_enable_rls justamente por
-- isso: as migrações rodam em ordem de nome, e a tabela precisa existir antes de
-- qualquer coisa mexer nela. Inserir uma migração "no passado" é incomum e o
-- CLI pode avisar sobre ordem — é intencional, e é a única posição em que este
-- arquivo funciona.
--
-- EFEITO EM PRODUÇÃO: NENHUM.
--
-- A tabela já existe lá, então o `create table if not exists` é no-op. Esta
-- migração serve para ambientes NOVOS (supabase start, staging, um reset) — é
-- por isso que cada detalhe precisa bater com produção: um erro aqui não quebra
-- produção, faz os ambientes novos divergirem dela em silêncio, que é a mesma
-- classe de bug da coluna `bio`.
begin;

create table if not exists public.profiles (
  id                   uuid        not null,
  -- NOT NULL confirmado na introspecção. O rascunho tinha esta coluna como
  -- nullable, o que teria deixado ambientes novos aceitando perfil sem username.
  username             text        not null,
  display_name         text,
  avatar_url           text,
  phone                text,
  bio                  text,
  onboarding_completed boolean     not null default false,
  username_confirmed   boolean     not null default false,
  -- NULLABLE com default, e não `not null default now()`: é o que produção tem.
  -- A diferença importa — com `not null`, um INSERT que passe `null` explícito
  -- falharia no ambiente novo e passaria em produção.
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),

  constraint profiles_pkey primary key (id),

  -- UNIQUE comum, e NÃO um índice funcional sobre lower(username).
  --
  -- Este era o item que eu tinha marcado como o mais importante da revisão, e o
  -- rascunho estava errado: eu havia inferido `unique (lower(username))` do
  -- comportamento de `is_username_available`, que compara em lower(). A
  -- introspecção mostrou UNIQUE simples, case-SENSITIVE.
  --
  -- Consequência a registrar: a unicidade do banco é sensível a maiúsculas, mas
  -- a checagem da aplicação não é. Na prática nada colide hoje porque
  -- normalizeUsername (utils/username.js) já força minúsculas antes de gravar —
  -- é a aplicação que garante o que o índice sozinho não garantiria.
  constraint profiles_username_key unique (username),

  constraint profiles_id_fkey foreign key (id)
    references auth.users (id) on delete cascade
);

-- ── bio ─────────────────────────────────────────────────────────────────────
-- Mesmo limite de src/utils/bio.js e da migração 20260910120000. Repetido aqui
-- para o baseline nascer completo; lá ele continua para as bases que já existem.
alter table public.profiles
  drop constraint if exists profiles_bio_length_check;

alter table public.profiles
  add constraint profiles_bio_length_check
  check (bio is null or char_length(bio) <= 160)
  not valid;

alter table public.profiles
  validate constraint profiles_bio_length_check;

-- ── phone ───────────────────────────────────────────────────────────────────
-- A COLUNA já estava no baseline (foi encontrada na varredura da API); o que
-- faltava eram estas duas regras, que só a introspecção revelou.
--
-- O índice é PARCIAL (`where phone is not null`) e é isso que o torna correto:
-- um unique comum trataria vários perfis sem telefone como duplicados de `null`
-- em alguns bancos, e aqui a esmagadora maioria dos perfis não tem telefone.
-- Como é parcial, não pode ser um constraint de tabela — daí ser um índice.
create unique index if not exists profiles_phone_key
  on public.profiles (phone)
  where phone is not null;

-- Formato E.164: "+" seguido de um dígito de 1 a 9 e mais 7 a 14 dígitos.
alter table public.profiles
  drop constraint if exists profiles_phone_e164_check;

alter table public.profiles
  add constraint profiles_phone_e164_check
  check ((phone is null) or (phone ~ '^\+[1-9][0-9]{7,14}$'))
  not valid;

alter table public.profiles
  validate constraint profiles_phone_e164_check;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- PROCEDÊNCIA DE CADA DECISÃO
--
-- CONFIRMADO POR INTROSPECÇÃO DO BANCO DE PRODUÇÃO:
--   • username NOT NULL
--   • created_at / updated_at nullable com default now()
--   • profiles_username_key como UNIQUE comum (sem lower())
--   • profiles_phone_key: unique parcial, where phone is not null
--   • profiles_phone_e164_check: (phone is null) or (phone ~ '^\+[1-9][0-9]{7,14}$')
--   • profiles_id_fkey: references auth.users(id) on delete cascade
--   • profiles_bio_length_check: char_length(bio) <= 160
--   • profiles_pkey: primary key (id)
--
-- CONFIRMADO ANTES, POR CONSULTA À API:
--   • quais colunas existem (varredura de ~90 nomes candidatos)
--   • o tipo de cada uma (erro de coerção do próprio Postgres)
--
-- AINDA NÃO CONFIRMADO — não bloqueia, mas fica registrado:
--   1. `text` vs `varchar(n)` nas colunas textuais. A introspecção reportada não
--      mencionou limite de tamanho, então seguem como `text`.
--   2. Nullability de display_name, avatar_url e bio. Nenhuma correção foi
--      apontada, então seguem nullable como no rascunho.
--   3. TRIGGER de updated_at. Não existe nenhum para `profiles` em migração
--      alguma, e a introspecção de constraints/índices não o mostraria. Se
--      produção tiver um, ele ainda falta aqui — e o sintoma seria updated_at
--      parando no valor do INSERT nos ambientes novos. Vale um
--      `select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass
--       and not tgisinternal;` para fechar.
-- ─────────────────────────────────────────────────────────────────────────────
