-- Fundação da viagem colaborativa: quem participa de qual viagem.
--
-- O QUE MUDA DE CONCEITO
--
-- Até aqui `travel_plans.user_id` era O dono, e a RLS inteira era
-- `user_id = auth.uid()`. Com mais de uma pessoa por viagem isso não se sustenta:
-- a participação deixa de ser uma coluna e vira uma TABELA, e a permissão passa a
-- ser uma pergunta ("esta pessoa é membro?") em vez de uma comparação.
--
-- `travel_plans.user_id` continua existindo, com outro papel: dono denormalizado.
-- Ele não some porque (a) o FK dele para profiles é `on delete cascade`, e é o que
-- garante que a viagem não fique órfã, e (b) manter a coluna deixa esta migração
-- reversível. Quem manda na permissão, a partir daqui, é `trip_members`.
--
-- O PADRÃO DA RLS é o mesmo de conversations/conversation_participants
-- (20260805190000): funções `stable security definer` consultadas pelas policies.
-- Escrever a policy consultando a própria tabela protegida causaria recursão
-- infinita — o Postgres avalia a policy da tabela dentro da policy da tabela.
--
-- ESCRITA EM trip_members É POR RPC, NÃO POR UPDATE DIRETO. A policy de UPDATE é
-- só do dono. Se um membro pudesse atualizar a própria linha, ele poderia trocar
-- o próprio `role` para 'owner' — a escalada de privilégio mais óbvia que existe
-- num modelo assim. Aceitar convite, sair da viagem e aplicar no mapa passam por
-- funções que escrevem o campo permitido e nada mais.

begin;

-- ── Tabela ───────────────────────────────────────────────────────────────────

create table if not exists public.trip_members (
  trip_id uuid not null references public.travel_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- owner  = criou (ou herdou) a viagem: edita, convida, remove e exclui.
  -- editor = edita o roteiro; não mexe em gente nem exclui a viagem.
  -- viewer = só lê. Existe desde já porque adicionar papel depois custaria
  --          reescrever policy; usar, só quando a UI oferecer.
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),

  -- 'pending' é convite enviado e não respondido. Um convidado pendente JÁ
  -- enxerga a viagem (é o que permite decidir se aceita), mas não escreve nada.
  status text not null default 'pending' check (status in ('pending', 'accepted')),

  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),

  -- Qual viagem esta PESSOA está vendo no globo.
  --
  -- Era uma coluna de travel_plans com índice único por user_id — o que só
  -- funcionava porque viagem tinha um dono só. Com dois participantes, a Vero
  -- aplicar a viagem no mapa dela ligaria a flag da VIAGEM e mudaria o globo do
  -- Elvis junto. O estado é de quem olha, não do que é olhado.
  is_active_on_map boolean not null default false,

  primary key (trip_id, user_id)
);

comment on table public.trip_members is
  'Participantes de uma viagem. Fonte da verdade da permissão: as policies de travel_plans, trip_days e trip_activities perguntam a esta tabela por is_trip_member/can_edit_trip/is_trip_owner.';

create index if not exists trip_members_user_idx
  on public.trip_members (user_id);

-- Uma viagem no globo por pessoa. É o mesmo invariante do índice antigo, agora
-- do lado certo: por USUÁRIO, não por viagem.
create unique index if not exists trip_members_one_active_on_map_idx
  on public.trip_members (user_id)
  where is_active_on_map;

-- ── Toda viagem nasce com dono ───────────────────────────────────────────────

create or replace function public.add_trip_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, status, joined_at)
  values (new.id, new.user_id, 'owner', 'accepted', now())
  on conflict (trip_id, user_id) do update
    set role = 'owner', status = 'accepted', joined_at = coalesce(trip_members.joined_at, now());
  return new;
end;
$$;

comment on function public.add_trip_owner_member() is
  'security definer porque a policy de INSERT de trip_members exige ser dono da viagem — e no instante deste trigger ainda não existe dono nenhum para consultar.';

drop trigger if exists add_trip_owner_member on public.travel_plans;
create trigger add_trip_owner_member
  after insert on public.travel_plans
  for each row execute function public.add_trip_owner_member();

-- Viagens que já existem viram viagens de um dono só.
insert into public.trip_members (trip_id, user_id, role, status, joined_at, created_at)
select tp.id, tp.user_id, 'owner', 'accepted', tp.created_at, tp.created_at
  from public.travel_plans tp
on conflict (trip_id, user_id) do nothing;

-- ── Quem pode o quê ──────────────────────────────────────────────────────────

-- Ler: qualquer membro, inclusive o convidado que ainda não respondeu.
create or replace function public.is_trip_member(trip_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = trip_uuid and user_id = auth.uid()
  );
$$;

-- Escrever no roteiro: membro aceito, com papel de dono ou editor.
create or replace function public.can_edit_trip(trip_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = trip_uuid
      and user_id = auth.uid()
      and status = 'accepted'
      and role in ('owner', 'editor')
  );
$$;

-- Excluir a viagem, convidar e remover gente: só o dono.
create or replace function public.is_trip_owner(trip_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = trip_uuid
      and user_id = auth.uid()
      and status = 'accepted'
      and role = 'owner'
  );
$$;

revoke all on function public.is_trip_member(uuid) from public, anon;
revoke all on function public.can_edit_trip(uuid) from public, anon;
revoke all on function public.is_trip_owner(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.can_edit_trip(uuid) to authenticated;
grant execute on function public.is_trip_owner(uuid) to authenticated;

-- ── RLS da viagem ────────────────────────────────────────────────────────────

drop policy if exists "Users read own travel plans" on public.travel_plans;
drop policy if exists "Users create own travel plans" on public.travel_plans;
drop policy if exists "Users update own travel plans" on public.travel_plans;
drop policy if exists "Users delete own travel plans" on public.travel_plans;

create policy "Members read trips"
  on public.travel_plans for select to authenticated
  using (public.is_trip_member(id));

-- Criar continua sendo em nome próprio: o trigger acima transforma o criador em
-- dono no mesmo comando.
create policy "Users create own trips"
  on public.travel_plans for insert to authenticated
  with check (user_id = auth.uid());

create policy "Editors update trips"
  on public.travel_plans for update to authenticated
  using (public.can_edit_trip(id))
  with check (public.can_edit_trip(id));

-- Excluir apaga para TODO MUNDO — decisão de produto. Quem não é dono sai da
-- viagem (delete da própria linha de trip_members), não exclui a viagem.
create policy "Owners delete trips"
  on public.travel_plans for delete to authenticated
  using (public.is_trip_owner(id));

-- ── RLS dos participantes ────────────────────────────────────────────────────

alter table public.trip_members enable row level security;

create policy "Members read members"
  on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));

-- Convidar é do dono. O bloqueio entra aqui, e não só na RPC, porque esta tabela
-- também é escrita direto pelo PostgREST: um bloqueio entre duas pessoas impede
-- o convite nos dois sentidos (mesma regra de conversas, ver is_blocked_either_way).
create policy "Owners invite members"
  on public.trip_members for insert to authenticated
  with check (
    public.is_trip_owner(trip_id)
    and not public.is_blocked_either_way(auth.uid(), user_id)
  );

-- Só o dono altera linha de participante (papel, status de outro). O membro mexe
-- na própria linha apenas pelas RPCs abaixo — se pudesse dar UPDATE direto,
-- poderia se promover a 'owner'.
create policy "Owners update members"
  on public.trip_members for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

-- Sair da viagem (própria linha) ou remover alguém (dono).
create policy "Owners remove members and members leave"
  on public.trip_members for delete to authenticated
  using (user_id = auth.uid() or public.is_trip_owner(trip_id));

-- ── A viagem nunca fica sem dono ─────────────────────────────────────────────

create or replace function public.prevent_last_trip_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  -- Só interessa quando a linha que sai (ou muda de papel) era a de um dono.
  --
  -- O retorno é por ramo explícito, e não `coalesce(new, old)`: em PL/pgSQL
  -- coalesce não aceita RECORD, e num BEFORE DELETE o `new` é nulo — a função
  -- levantaria erro justamente no caminho que ela existe para proteger.
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  select count(*) into remaining
    from public.trip_members
   where trip_id = old.trip_id
     and role = 'owner'
     and status = 'accepted'
     and user_id <> old.user_id;

  if remaining = 0 then
    raise exception 'A viagem ficaria sem dono. Transfira a propriedade antes de sair, ou exclua a viagem.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

comment on function public.prevent_last_trip_owner_removal() is
  'Sem esta trava, o dono sair da própria viagem deixaria uma viagem viva que ninguém pode editar nem excluir — invisível para o app e impossível de limpar.';

drop trigger if exists prevent_last_trip_owner_removal on public.trip_members;
create trigger prevent_last_trip_owner_removal
  before update or delete on public.trip_members
  for each row execute function public.prevent_last_trip_owner_removal();

-- ── A viagem no globo, agora por participante ────────────────────────────────

-- Migração do dado: quem tinha uma viagem aplicada continua com ela aplicada.
update public.trip_members m
   set is_active_on_map = true
  from public.travel_plans t
 where t.id = m.trip_id
   and t.user_id = m.user_id
   and t.is_active_on_map;

drop index if exists public.travel_plans_one_active_on_map_idx;

alter table public.travel_plans
  drop column if exists is_active_on_map;

-- Mesma assinatura de antes (set_active_plan_on_map(uuid)), para o app não
-- precisar saber que a coluna mudou de lugar. O que muda é ONDE ela escreve.
--
-- security definer: a policy de UPDATE de trip_members é só do dono, e aplicar
-- uma viagem no próprio globo é coisa que todo membro faz. A função escreve UM
-- campo, e só na linha de quem chamou.
create or replace function public.set_active_plan_on_map(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'set_active_plan_on_map: sem sessão';
  end if;

  update public.trip_members
     set is_active_on_map = false
   where user_id = auth.uid()
     and is_active_on_map
     and (p_plan_id is null or trip_id <> p_plan_id);

  if p_plan_id is not null then
    update public.trip_members
       set is_active_on_map = true
     where trip_id = p_plan_id
       and user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.set_active_plan_on_map(uuid) from public, anon;
grant execute on function public.set_active_plan_on_map(uuid) to authenticated;

-- ── Ações do participante (o que a policy de UPDATE não permite) ─────────────

create or replace function public.accept_trip_invite(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trip_members
     set status = 'accepted', joined_at = coalesce(joined_at, now())
   where trip_id = p_trip_id
     and user_id = auth.uid()
     and status = 'pending';
end;
$$;

create or replace function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- O trigger acima recusa a saída do último dono, com mensagem própria.
  delete from public.trip_members
   where trip_id = p_trip_id
     and user_id = auth.uid();
end;
$$;

revoke all on function public.accept_trip_invite(uuid) from public, anon;
revoke all on function public.leave_trip(uuid) from public, anon;
grant execute on function public.accept_trip_invite(uuid) to authenticated;
grant execute on function public.leave_trip(uuid) to authenticated;

commit;
