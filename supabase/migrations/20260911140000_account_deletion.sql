-- Exclusão de conta: pedido imediato, 5 dias de carência, limpeza definitiva.
--
-- ⚠️ NÃO APLICADA. Revisar antes do push.
--
-- A REGRA
--
-- Pedir exclusão NÃO apaga nada: marca `profiles.deletion_requested_at`, desloga
-- a pessoa e torna a conta invisível para as outras. Se ela logar de novo dentro
-- de 5 dias, a marca é zerada e tudo volta. Passados 5 dias sem login, um job
-- diário chama a Edge Function `purge-accounts`, que executa a limpeza no banco
-- e apaga os arquivos no Storage.
--
-- POR QUE A LIMPEZA É EXPLÍCITA, E NÃO UM `delete from auth.users`
--
-- As FKs para `auth.users` são quase todas `on delete cascade`, então bastaria
-- apagar o usuário — mas o cascade produz o comportamento ERRADO em dois pontos:
--
--   1. `messages.sender_id` é cascade: apagar o usuário APAGARIA as mensagens
--      dele, e a regra é manter o texto e anonimizar o remetente.
--   2. `conversations.created_by` é cascade, e `messages.conversation_id` também:
--      apagar o usuário apagaria as conversas que ele criou e, com elas, TODAS as
--      mensagens daquelas conversas — inclusive as da outra pessoa.
--
-- Por isso as duas colunas passam a ser anuláveis com `on delete set null`
-- (seção 1), e `purge_account` trata cada tabela explicitamente. O cascade
-- continua existindo como rede de segurança, não como mecanismo.
begin;

-- ---------------------------------------------------------------------------
-- 1. Schema: mensagens sobrevivem ao dono
-- ---------------------------------------------------------------------------

alter table public.messages
  alter column sender_id drop not null;

alter table public.messages
  drop constraint if exists messages_sender_id_fkey;

alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references auth.users (id) on delete set null;

alter table public.conversations
  alter column created_by drop not null;

alter table public.conversations
  drop constraint if exists conversations_created_by_fkey;

alter table public.conversations
  add constraint conversations_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

comment on column public.messages.sender_id is
  'Null significa "Usuário removido": o autor excluiu a conta e a mensagem foi anonimizada, preservando o histórico da outra pessoa.';

-- ---------------------------------------------------------------------------
-- 2. Marca de exclusão pedida
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

-- Índice PARCIAL: em regime normal quase toda linha é null, e um índice cheio
-- seria custo de escrita sem retorno. O job diário e as policies só perguntam
-- pelas linhas marcadas.
create index if not exists profiles_deletion_requested_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

comment on column public.profiles.deletion_requested_at is
  'Quando a exclusão foi pedida. Não-nulo = conta em carência: invisível para terceiros e sujeita à limpeza após 5 dias. Login dentro do prazo zera a coluna.';

-- Janela de carência, num lugar só. Mudou aqui, muda no job e nas policies.
create or replace function public.account_deletion_grace_period()
returns interval
language sql
immutable
as $$ select interval '5 days' $$;

-- ---------------------------------------------------------------------------
-- 3. A conta está ativa? (usada por 7 policies)
-- ---------------------------------------------------------------------------
--
-- `security definer` NÃO é opcional aqui: esta função é chamada de dentro da
-- policy de `profiles`, e sem o definer ela dispararia a própria policy ao ler
-- a tabela — recursão infinita. Com o definer, a leitura interna ignora RLS.
--
-- `stable` permite ao planejador reaproveitar o resultado dentro da consulta.
create or replace function public.is_account_active(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where id = target
      and deletion_requested_at is not null
  );
$$;

revoke all on function public.is_account_active(uuid) from public;
grant execute on function public.is_account_active(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Invisibilidade durante a carência
-- ---------------------------------------------------------------------------
--
-- Todas as policies abaixo mantêm `... = auth.uid()` como primeira alternativa:
-- quem pediu a exclusão continua enxergando o PRÓPRIO conteúdo. Sem isso a
-- pessoa que logasse para reverter encontraria um perfil vazio e acharia que já
-- tinha perdido tudo.
--
-- `favorite_photos` NÃO entra: a policy dela já é `user_id = auth.uid()`, ou
-- seja, só o dono lê. Não há o que esconder de terceiros, e adicionar a checagem
-- custaria uma chamada de função em toda leitura sem mudar o que se enxerga.

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_account_active(id));

drop policy if exists country_photos_select on public.country_photos;
create policy country_photos_select on public.country_photos
  for select to authenticated
  using (
    user_id = auth.uid()
    or (is_public = true and public.is_account_active(user_id))
  );

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (user_id = auth.uid() or public.is_account_active(user_id));

-- Os dois lados da relação: some tanto quem a pessoa segue quanto quem a segue.
drop policy if exists followers_select on public.followers;
create policy followers_select on public.followers
  for select to authenticated
  using (
    (follower_id = auth.uid() or public.is_account_active(follower_id))
    and (following_id = auth.uid() or public.is_account_active(following_id))
  );

drop policy if exists visited_countries_select on public.visited_countries;
create policy visited_countries_select on public.visited_countries
  for select to authenticated
  using (user_id = auth.uid() or public.is_account_active(user_id));

drop policy if exists wishlist_select on public.wishlist;
create policy wishlist_select on public.wishlist
  for select to authenticated
  using (user_id = auth.uid() or public.is_account_active(user_id));

-- Notificação é lida só pelo destinatário, mas o vazamento aqui é o ATOR: sem
-- esta checagem, "Fulano curtiu sua foto" continuaria aparecendo para terceiros
-- com o nome de quem está em carência.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    and (
      actor_id is null
      or actor_id = auth.uid()
      or public.is_account_active(actor_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Pedir e cancelar
-- ---------------------------------------------------------------------------

create or replace function public.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested timestamptz;
begin
  if auth.uid() is null then
    raise exception 'request_account_deletion: sem usuário autenticado';
  end if;

  -- `coalesce` deixa a chamada idempotente: pedir duas vezes não reinicia a
  -- contagem, senão bastaria tocar no botão de novo para adiar a limpeza.
  update public.profiles
     set deletion_requested_at = coalesce(deletion_requested_at, now())
   where id = auth.uid()
  returning deletion_requested_at into requested;

  if requested is null then
    raise exception 'request_account_deletion: perfil não encontrado';
  end if;

  return requested;
end;
$$;

revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- Chamada no login. Reverter é só zerar a marca — nada foi apagado ainda.
create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  estava_marcada boolean;
begin
  if auth.uid() is null then
    raise exception 'cancel_account_deletion: sem usuário autenticado';
  end if;

  update public.profiles
     set deletion_requested_at = null
   where id = auth.uid()
     and deletion_requested_at is not null
  returning true into estava_marcada;

  return coalesce(estava_marcada, false);
end;
$$;

revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A limpeza definitiva
-- ---------------------------------------------------------------------------
--
-- NÃO recebe `grant execute to authenticated`: só o service_role (a Edge
-- Function) a executa. Fosse chamável pelo cliente, qualquer pessoa logada
-- apagaria a conta de terceiro passando outro uuid.
--
-- Devolve os caminhos do Storage porque SQL não alcança bucket: quem apaga os
-- arquivos é a Edge Function, com o retorno desta função na mão.
create or replace function public.purge_account(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inesperadas text;
  avatar text;
  fotos text[];
begin
  if target is null then
    raise exception 'purge_account: uuid nulo';
  end if;

  -- 6.1 Varredura defensiva.
  --
  -- Se alguém criar uma tabela com FK para auth.users/profiles e não atualizar
  -- esta função, o dado dela ficaria para trás sem ninguém perceber. Melhor
  -- abortar a transação inteira e deixar a falha visível.
  --
  -- O schema `auth` fica de fora: aquelas tabelas são do Supabase (sessions,
  -- identities, mfa_factors…) e o cascade delas é responsabilidade do produto.
  select string_agg(distinct c.conrelid::regclass::text, ', ')
    into inesperadas
  from pg_catalog.pg_constraint c
  where c.contype = 'f'
    and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and c.connamespace <> 'auth'::regnamespace
    and c.conrelid::regclass::text not in (
      'visited_countries', 'country_photos', 'favorite_photos', 'profiles',
      'followers', 'wishlist', 'notifications', 'comments', 'travel_plans',
      'support_tickets', 'explore_interactions', 'conversations',
      'conversation_participants', 'messages', 'passport_shares'
    );

  if inesperadas is not null then
    raise exception
      'purge_account: tabela com FK não prevista (%). Atualize a lista desta função antes de excluir contas.',
      inesperadas;
  end if;

  -- 6.2 Caminhos do Storage, coletados ANTES de apagar as linhas.
  select p.avatar_url into avatar
    from public.profiles p where p.id = target;

  select coalesce(array_agg(cp.photo_path) filter (where cp.photo_path is not null), '{}')
    into fotos
    from public.country_photos cp where cp.user_id = target;

  -- 6.3 Mensagens: anonimizadas, não apagadas. O texto é metade do histórico da
  --     outra pessoa. Só possível porque a seção 1 tornou a coluna anulável.
  update public.messages set sender_id = null where sender_id = target;

  -- 6.4 Conversas criadas por ele sobrevivem sem dono, pelo mesmo motivo.
  update public.conversations set created_by = null where created_by = target;

  -- 6.5 Notificações em que ELE é o ator: apagadas. O FK é `set null`, então
  --     sobreviveriam como "alguém curtiu sua foto" sem ator, que a tela não
  --     sabe renderizar.
  delete from public.notifications where actor_id = target;

  -- 6.6 Tudo que é dele, apagado.
  delete from public.country_photos            where user_id = target;
  delete from public.comments                  where user_id = target;
  delete from public.favorite_photos           where user_id = target;
  delete from public.visited_countries         where user_id = target;
  delete from public.wishlist                  where user_id = target;
  delete from public.travel_plans              where user_id = target;
  delete from public.explore_interactions      where user_id = target;
  delete from public.notifications             where user_id = target;
  delete from public.followers                 where follower_id = target or following_id = target;
  delete from public.passport_shares           where sender_id = target or recipient_id = target;
  delete from public.conversation_participants where user_id = target;

  -- 6.7 `support_tickets` NÃO é apagado: o FK é `set null` e o histórico de
  --     atendimento fica, desvinculado. É o que a Política de Privacidade diz.

  delete from public.profiles where id = target;

  -- 6.8 Por último o usuário. A esta altura o cascade não tem mais o que levar.
  delete from auth.users where id = target;

  return jsonb_build_object(
    'user_id', target,
    'avatar_url', avatar,
    'photo_paths', to_jsonb(fotos)
  );
end;
$$;

revoke all on function public.purge_account(uuid) from public;
revoke all on function public.purge_account(uuid) from authenticated;
grant execute on function public.purge_account(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Quem venceu a carência
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_accounts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta record;
  resultados jsonb := '[]'::jsonb;
begin
  for conta in
    select id
      from public.profiles
     where deletion_requested_at is not null
       and deletion_requested_at < now() - public.account_deletion_grace_period()
     order by deletion_requested_at
  loop
    resultados := resultados || public.purge_account(conta.id);
  end loop;

  return jsonb_build_object('purged', jsonb_array_length(resultados), 'accounts', resultados);
end;
$$;

revoke all on function public.purge_expired_accounts() from public;
revoke all on function public.purge_expired_accounts() from authenticated;
grant execute on function public.purge_expired_accounts() to service_role;

commit;
