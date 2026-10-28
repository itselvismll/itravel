-- Tarefas do grupo: quem ficou de fazer o quê antes da viagem.
--
-- A checklist que já existe (passaporte, seguro, adaptador) é da VIAGEM: uma
-- lista igual para todo mundo, dentro de `travel_plans.plan_data`. Esta tabela
-- responde outra pergunta — "quem ficou de fazer isso?" —, e é por isso que ela
-- é tabela e não mais um campo no JSON: tarefa tem dono, tem quem concluiu e
-- tem quando, e cada uma dessas três colunas precisa de regra de escrita
-- própria. Em JSON não há RLS que alcance um item da lista.
--
-- ── A NOTIFICAÇÃO SAI DA TRANSIÇÃO, NÃO DA INTENÇÃO ─────────────────────────
--
-- Esta é a amarra central do arquivo, e ela existe porque o projeto já errou
-- isso duas vezes no roteiro:
--
--   1. o aviso "Fulano editou a viagem" saía de um UPDATE que regravava os
--      mesmos valores — ninguém tinha editado nada (migração 20260923120000);
--   2. antes disso, a autoria era carimbada em toda parada a cada salvamento,
--      e não na parada que mudou.
--
-- Aqui o evento é a AÇÃO em si (criar, concluir), então não há "mudou o
-- conteúdo?" para comparar — e justamente por isso a tentação é pendurar o
-- aviso em qualquer lugar por onde a ação passa. Não: cada aviso está preso a
-- uma transição de linha que só acontece de um jeito.
--
--   `notify_trip_task_created` — AFTER INSERT. Uma linha nova é um evento que
--   acontece uma vez, e não tem como acontecer duas.
--
--   `notify_trip_task_done` — AFTER UPDATE, com `when (old.is_done = false and
--   new.is_done = true)` no PRÓPRIO trigger. A guarda é declarativa, no
--   `create trigger`, e não um `if` no corpo da função: assim ela não depende de
--   ninguém lembrar de escrevê-la, e o Postgres nem chama a função fora da
--   transição. Salvar uma tarefa que já estava concluída não dispara; desmarcar
--   não dispara; mudar o título de uma tarefa concluída não dispara.
--
-- E nenhum dos dois passa por `log_trip_edit`: aquele caminho AGRUPA os avisos
-- numa janela de 30 minutos, o que é certo para dezenas de paradas salvas de uma
-- vez e errado aqui — três tarefas criadas na mesma sessão são três coisas
-- diferentes para fazer, e duas delas sumiriam.
--
-- ── ORDEM DE DEPLOY ─────────────────────────────────────────────────────────
--
-- Esta migração ANTES do app: a tela lê `trip_tasks` e os tipos novos de
-- notificação, e nenhum dos dois existe sem ela.

begin;

-- ── A tabela ────────────────────────────────────────────────────────────────

create table if not exists public.trip_tasks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.travel_plans (id) on delete cascade,

  title text not null check (length(btrim(title)) between 1 and 120),

  -- Quem ficou de fazer. Nulo = tarefa do grupo, sem dono definido; e `on
  -- delete set null` porque a tarefa continua existindo se a pessoa sair do
  -- Journi — some o dono, não a tarefa.
  assigned_to uuid references public.profiles (id) on delete set null,

  -- As três colunas de autoria. Escritas SÓ por trigger, com `auth.uid()`; o
  -- que o cliente mandar nelas é descartado (ver stamp_trip_task_state).
  created_by uuid references public.profiles (id) on delete set null,
  is_done boolean not null default false,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,

  created_at timestamptz not null default now()
);

comment on table public.trip_tasks is
  'Tarefas do grupo de uma viagem: título, responsável e conclusão. Quem cria é organizador; quem conclui é o responsável ou um organizador.';
comment on column public.trip_tasks.created_by is
  'Quem criou. Escrito só pelo trigger stamp_trip_task_state, com auth.uid().';
comment on column public.trip_tasks.completed_by is
  'Quem marcou como concluída. Volta a nulo quando a tarefa é desmarcada. Escrito só por trigger.';

-- A tela lista as tarefas de UMA viagem, na ordem em que foram criadas.
create index if not exists trip_tasks_trip_idx
  on public.trip_tasks (trip_id, created_at);

-- ── Quem pode o quê ─────────────────────────────────────────────────────────
--
-- As mesmas três funções do resto da viagem (migração 20260915120000), para a
-- permissão de tarefa não virar uma quarta definição de "participante".

alter table public.trip_tasks enable row level security;

-- Ler: qualquer participante, igual ao roteiro. Inclusive quem não pode marcar
-- nada — a lista continua visível para quem só acompanha.
create policy "Members read trip tasks"
  on public.trip_tasks for select to authenticated
  using (public.is_trip_member(trip_id));

-- Criar e apagar: só organizador.
create policy "Organizers create trip tasks"
  on public.trip_tasks for insert to authenticated
  with check (public.is_trip_owner(trip_id));

create policy "Organizers delete trip tasks"
  on public.trip_tasks for delete to authenticated
  using (public.is_trip_owner(trip_id));

-- Alterar: o responsável ou um organizador.
--
-- A RLS decide se a LINHA pode ser tocada; ela não sabe falar de COLUNA. Quem
-- diz que o responsável só mexe em `is_done` (e não no título, nem em para quem
-- a tarefa aponta) é o trigger `guard_trip_task_columns`, logo abaixo. Policy de
-- coluna existiria via `grant update (col)`, mas isso é por PAPEL do banco
-- (todo mundo é `authenticated` aqui), não por quem a pessoa é na viagem.
create policy "Assignee or organizer updates trip tasks"
  on public.trip_tasks for update to authenticated
  using (public.is_trip_owner(trip_id) or assigned_to = auth.uid())
  with check (public.is_trip_owner(trip_id) or assigned_to = auth.uid());

-- ── A coluna que cada um pode mexer ─────────────────────────────────────────

create or replace function public.guard_trip_task_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Organizador mexe em tudo; o caminho de quem não é organizador só pode ter
  -- mudado o estado de conclusão. Erro, e não correção silenciosa: devolver o
  -- título antigo fingindo que gravou é pior do que recusar — a pessoa sairia da
  -- tela achando que mudou.
  if public.is_trip_owner(new.trip_id) then
    return new;
  end if;

  if new.title is distinct from old.title
     or new.assigned_to is distinct from old.assigned_to
     or new.trip_id is distinct from old.trip_id then
    raise exception 'Só um organizador pode alterar o título e o responsável da tarefa.';
  end if;

  return new;
end;
$$;

-- ── A autoria e a conclusão, escritas só pelo servidor ──────────────────────

create or replace function public.stamp_trip_task_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    -- Tarefa nasce por fazer, sempre. Fosse possível criá-la já concluída, o
    -- aviso de conclusão nunca sairia para ela: ele está preso à transição
    -- false -> true, e essa tarefa jamais passaria por ela.
    new.is_done := false;
    new.completed_by := null;
    new.completed_at := null;
    return new;
  end if;

  -- UPDATE. O que veio do cliente nestas colunas nunca vale.
  new.created_by := old.created_by;

  if new.is_done and not old.is_done then
    new.completed_by := auth.uid();
    new.completed_at := now();
  elsif old.is_done and not new.is_done then
    -- Desmarcou: a conclusão não aconteceu, e "concluído por" não pode ficar
    -- apontando para alguém.
    new.completed_by := null;
    new.completed_at := null;
  else
    -- Só mudou título ou responsável: quem concluiu continua sendo quem concluiu.
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
  end if;

  return new;
end;
$$;

-- Ordem dos BEFORE (alfabética, como todo trigger do mesmo momento no Postgres):
-- guard < skip < stamp. O guard recusa a coluna proibida antes de qualquer
-- carimbo, e o skip descarta o update que não muda nada — nele o stamp nem roda.
drop trigger if exists guard_trip_task_columns on public.trip_tasks;
create trigger guard_trip_task_columns
  before update on public.trip_tasks
  for each row execute function public.guard_trip_task_columns();

drop trigger if exists skip_unchanged_trip_tasks on public.trip_tasks;
create trigger skip_unchanged_trip_tasks
  before update on public.trip_tasks
  for each row execute function suppress_redundant_updates_trigger();

drop trigger if exists stamp_trip_task_state on public.trip_tasks;
create trigger stamp_trip_task_state
  before insert or update on public.trip_tasks
  for each row execute function public.stamp_trip_task_state();

-- ── Os dois tipos novos de notificação ──────────────────────────────────────
--
-- `src/utils/socialNotifications.js` precisa listá-los também: aquela lista é o
-- filtro da tela de notificações E do "marcar como lida". Tipo que chega ao
-- banco e não está lá é invisível e nunca é lido — o sino fica preso num número
-- que ninguém consegue zerar.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'follow', 'comment', 'like',
    'trip_invite', 'trip_joined', 'trip_edit',
    -- Um organizador criou uma tarefa do grupo.
    'trip_task_created',
    -- Alguém concluiu uma tarefa do grupo.
    'trip_task_done'
  ));

-- ── Os avisos ───────────────────────────────────────────────────────────────
--
-- Os dois mandam o título da tarefa em `preview` e o `trip_id` em `target_id`:
-- o texto da tela sai de `utils/notificationRouting` ("Fulano criou uma tarefa"),
-- e tocar no aviso abre a viagem, que é onde a tarefa está.
--
-- Sem agrupamento por janela, ao contrário de `trip_edit`: ver o cabeçalho.

create or replace function public.notify_trip_task_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `created_by` e não `auth.uid()`: é a mesma pessoa (o trigger de carimbo já
  -- rodou), e ler da linha mantém o aviso preso ao dado que foi gravado.
  if new.created_by is null then return new; end if;

  insert into public.notifications (user_id, actor_id, type, message, read, target_id, preview)
  select m.user_id, new.created_by, 'trip_task_created', 'criou uma tarefa', false,
         new.trip_id::text, new.title
    from public.trip_members m
   where m.trip_id = new.trip_id
     and m.status = 'accepted'
     -- Quem criou não recebe aviso do próprio ato. É o mesmo cuidado de
     -- notify_trip_membership, e é o que impede o sino de virar eco.
     and m.user_id <> new.created_by;

  return new;
end;
$$;

create or replace function public.notify_trip_task_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completed_by is null then return new; end if;

  insert into public.notifications (user_id, actor_id, type, message, read, target_id, preview)
  select m.user_id, new.completed_by, 'trip_task_done', 'concluiu uma tarefa', false,
         new.trip_id::text, new.title
    from public.trip_members m
   where m.trip_id = new.trip_id
     and m.status = 'accepted'
     and m.user_id <> new.completed_by;

  return new;
end;
$$;

drop trigger if exists notify_trip_task_created on public.trip_tasks;
create trigger notify_trip_task_created
  after insert on public.trip_tasks
  for each row execute function public.notify_trip_task_created();

-- A GUARDA ESTÁ AQUI, no `when`, e não dentro da função: o Postgres nem chama a
-- função fora da transição false -> true. Um update que salva a tarefa de novo
-- com `is_done` já true não dispara; desmarcar não dispara.
drop trigger if exists notify_trip_task_done on public.trip_tasks;
create trigger notify_trip_task_done
  after update on public.trip_tasks
  for each row
  when (old.is_done = false and new.is_done = true)
  execute function public.notify_trip_task_done();

commit;
