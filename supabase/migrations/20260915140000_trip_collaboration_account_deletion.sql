-- Excluir a conta não pode mais apagar a viagem dos outros.
--
-- O QUE QUEBRARIA SEM ISTO — DUAS COISAS, E A SEGUNDA É SILENCIOSA
--
-- 1. `purge_account` tem uma varredura defensiva: se aparecer uma tabela com FK
--    para profiles/auth.users que não esteja na lista dela, a função ABORTA de
--    propósito ("atualize a lista antes de excluir contas"). As três tabelas
--    novas — trip_members, trip_days, trip_activities — cairiam exatamente nesse
--    laço, e toda exclusão de conta passaria a falhar.
--
-- 2. `delete from travel_plans where user_id = target` apagaria a viagem inteira,
--    com os convidados dentro dela. E mesmo trocando esse delete por nada, a
--    viagem morreria assim mesmo: `travel_plans.user_id` referencia
--    `profiles(id) on delete cascade`, então apagar o perfil do dono leva a
--    viagem junto, em silêncio, pelo banco. É por isso que a transferência de
--    propriedade precisa reescrever `user_id`, e não só o `role` em trip_members.
--
-- A REGRA DE PRODUTO: viagem com outro participante aceito muda de dono (o mais
-- antigo a ter entrado); viagem em que a pessoa estava sozinha é apagada como
-- sempre foi.

begin;

-- A transferência em si, isolada para poder ser exercitada sem apagar ninguém.
create or replace function public.transfer_trips_before_purge(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  viagem record;
  herdeiro uuid;
  transferidas integer := 0;
begin
  for viagem in
    select tp.id
      from public.travel_plans tp
     where tp.user_id = target
  loop
    -- O participante aceito mais antigo, excluindo quem está saindo. `joined_at`
    -- pode ser nulo em linha antiga, daí o desempate por created_at.
    select m.user_id into herdeiro
      from public.trip_members m
     where m.trip_id = viagem.id
       and m.user_id <> target
       and m.status = 'accepted'
     order by coalesce(m.joined_at, m.created_at) asc, m.created_at asc
     limit 1;

    if herdeiro is null then
      continue; -- Viagem de uma pessoa só: segue para o delete normal.
    end if;

    update public.trip_members
       set role = 'owner', joined_at = coalesce(joined_at, now())
     where trip_id = viagem.id
       and user_id = herdeiro;

    -- O dono denormalizado PRECISA mudar: é o cascade dele que apagaria a viagem
    -- quando o perfil antigo for removido.
    update public.travel_plans
       set user_id = herdeiro
     where id = viagem.id;

    -- A linha do antigo dono sai aqui, com o novo dono já no lugar — o trigger
    -- prevent_last_trip_owner_removal exige que sobre um dono, e sobra.
    delete from public.trip_members
     where trip_id = viagem.id
       and user_id = target;

    transferidas := transferidas + 1;
  end loop;

  return transferidas;
end;
$$;

revoke all on function public.transfer_trips_before_purge(uuid) from public, anon, authenticated;
grant execute on function public.transfer_trips_before_purge(uuid) to service_role;

-- `purge_account` inteira de novo (é `create or replace`), com duas mudanças: a
-- lista da varredura ganha as três tabelas novas, e a transferência acontece
-- ANTES do delete das viagens. O resto é idêntico à versão vigente, que é a de
-- 20260914180000_reports (a última a reescrever esta função) — inclusive o
-- delete de blocked_users, que veio de lá.
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
  transferidas integer;
begin
  if target is null then
    raise exception 'purge_account: uuid nulo';
  end if;

  select string_agg(distinct cl.relname, ', ')
    into inesperadas
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class cl on cl.oid = c.conrelid
  where c.contype = 'f'
    and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and cl.relnamespace = 'public'::regnamespace
    and cl.relname not in (
      'visited_countries', 'country_photos', 'favorite_photos', 'profiles',
      'followers', 'wishlist', 'notifications', 'comments', 'travel_plans',
      'support_tickets', 'explore_interactions', 'conversations',
      'conversation_participants', 'messages', 'passport_shares',
      'blocked_users', 'reports',
      -- Viagem colaborativa. trip_days e trip_activities não têm FK para
      -- profiles hoje, mas entram na lista para o dia em que ganharem uma coluna
      -- de autoria (ex.: quem adicionou a parada) — a varredura existe
      -- justamente para isso não passar despercebido.
      'trip_members', 'trip_days', 'trip_activities'
    );

  if inesperadas is not null then
    raise exception
      'purge_account: tabela com FK não prevista (%). Atualize a lista desta função antes de excluir contas.',
      inesperadas;
  end if;

  select p.avatar_url into avatar
    from public.profiles p where p.id = target;

  select coalesce(array_agg(cp.photo_path) filter (where cp.photo_path is not null), '{}')
    into fotos
    from public.country_photos cp where cp.user_id = target;

  -- ANTES de qualquer delete: as viagens com outra pessoa dentro trocam de dono.
  transferidas := public.transfer_trips_before_purge(target);

  update public.messages      set sender_id  = null where sender_id  = target;
  update public.conversations set created_by = null where created_by = target;

  delete from public.notifications where actor_id = target;

  delete from public.country_photos            where user_id = target;
  delete from public.comments                  where user_id = target;
  delete from public.favorite_photos           where user_id = target;
  delete from public.visited_countries         where user_id = target;
  delete from public.wishlist                  where user_id = target;
  -- As que sobraram aqui são as viagens em que ele estava sozinho.
  delete from public.travel_plans              where user_id = target;
  delete from public.trip_members              where user_id = target;
  delete from public.explore_interactions      where user_id = target;
  delete from public.notifications             where user_id = target;
  delete from public.followers                 where follower_id = target or following_id = target;
  delete from public.passport_shares           where sender_id = target or recipient_id = target;
  delete from public.conversation_participants where user_id = target;
  delete from public.blocked_users             where blocker_id = target or blocked_id = target;

  delete from public.profiles where id = target;
  delete from auth.users where id = target;

  return jsonb_build_object(
    'user_id', target,
    'avatar_url', avatar,
    'photo_paths', to_jsonb(fotos),
    'trips_transferred', transferidas
  );
end;
$$;

-- O `create or replace` reaplica os default privileges do Supabase, então o
-- revoke vem DEPOIS — senão a função volta aberta para anon.
revoke all on function public.purge_account(uuid) from public, anon, authenticated;
grant execute on function public.purge_account(uuid) to service_role;

commit;
