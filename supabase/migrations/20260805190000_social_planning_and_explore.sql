begin;

-- Um país já visitado não deve continuar na lista "Quero visitar".
create or replace function public.remove_visited_country_from_wishlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wishlist
  where user_id = new.user_id
    and upper(country_code) = upper(new.country_code);
  return new;
end;
$$;

revoke all on function public.remove_visited_country_from_wishlist() from public;
drop trigger if exists after_visit_remove_wishlist on public.visited_countries;
create trigger after_visit_remove_wishlist
after insert or update of country_code on public.visited_countries
for each row execute function public.remove_visited_country_from_wishlist();

delete from public.notifications where type = 'comment' and photo_id is null;

delete from public.notifications notification
using public.notifications duplicate
where (
    notification.created_at < duplicate.created_at
    or (notification.created_at = duplicate.created_at and notification.id::text < duplicate.id::text)
  )
  and notification.user_id = duplicate.user_id
  and notification.actor_id = duplicate.actor_id
  and notification.type = duplicate.type
  and notification.type = 'follow';

delete from public.notifications notification
using public.notifications duplicate
where (
    notification.created_at < duplicate.created_at
    or (notification.created_at = duplicate.created_at and notification.id::text < duplicate.id::text)
  )
  and notification.user_id = duplicate.user_id
  and notification.actor_id = duplicate.actor_id
  and notification.type = 'comment'
  and duplicate.type = 'comment'
  and notification.photo_id = duplicate.photo_id;

-- Remove fluxos antigos de comentário que também gravavam notificações.
do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select trigger.tgname
    from pg_trigger trigger
    join pg_proc procedure on procedure.oid = trigger.tgfoid
    where trigger.tgrelid = 'public.comments'::regclass
      and not trigger.tgisinternal
      and pg_get_functiondef(procedure.oid) ilike '%notifications%'
  loop
    execute format('drop trigger if exists %I on public.comments', trigger_record.tgname);
  end loop;
end;
$$;

create or replace function public.notify_comment_once()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.country_photos where id = new.photo_id;
  if owner_id is null or owner_id = new.user_id then return new; end if;

  delete from public.notifications
  where user_id = owner_id
    and actor_id = new.user_id
    and type = 'comment'
    and photo_id = new.photo_id;

  insert into public.notifications (user_id, actor_id, type, message, read, photo_id)
  values (owner_id, new.user_id, 'comment', 'comentou sua foto', false, new.photo_id);
  return new;
end;
$$;

revoke all on function public.notify_comment_once() from public;
create trigger on_comment_created_notify_once
after insert on public.comments
for each row execute function public.notify_comment_once();

create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where user_id = new.following_id and actor_id = new.follower_id and type = 'follow';
  insert into public.notifications (user_id, actor_id, type, message, read)
  values (new.following_id, new.follower_id, 'follow', 'começou a seguir você', false);
  return new;
end;
$$;

create table if not exists public.explore_interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  event_type text not null check (event_type in ('search', 'open', 'photo_open')),
  created_at timestamptz not null default now()
);
create index if not exists explore_interactions_rank_idx on public.explore_interactions (user_id, country_code, created_at desc);
alter table public.explore_interactions enable row level security;
create policy "Users manage own explore signals" on public.explore_interactions
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  shared_photo_id text,
  shared_photo jsonb,
  shared_plan jsonb,
  created_at timestamptz not null default now(),
  check (char_length(trim(coalesce(body, ''))) > 0 or shared_photo is not null or shared_plan is not null)
);

create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index if not exists conversation_participants_user_idx on public.conversation_participants (user_id);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_conversation_participant(conversation_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_participants
    where conversation_id = conversation_uuid and user_id = auth.uid()
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

create policy "Participants read conversations" on public.conversations for select to authenticated
using (public.is_conversation_participant(id));
create policy "Participants read participants" on public.conversation_participants for select to authenticated
using (public.is_conversation_participant(conversation_id));
create policy "Participants read messages" on public.messages for select to authenticated
using (public.is_conversation_participant(conversation_id));
create policy "Participants send messages" on public.messages for insert to authenticated
with check (sender_id = auth.uid() and public.is_conversation_participant(conversation_id));

create or replace function public.get_or_create_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_uuid uuid;
begin
  if current_user_id is null or other_user_id is null or current_user_id = other_user_id then
    raise exception 'Participante inválido';
  end if;

  select participant.conversation_id into conversation_uuid
  from public.conversation_participants participant
  where participant.user_id in (current_user_id, other_user_id)
  group by participant.conversation_id
  having count(distinct participant.user_id) = 2
    and (select count(*) from public.conversation_participants all_participants where all_participants.conversation_id = participant.conversation_id) = 2
  limit 1;

  if conversation_uuid is null then
    insert into public.conversations (created_by) values (current_user_id) returning id into conversation_uuid;
    insert into public.conversation_participants (conversation_id, user_id)
    values (conversation_uuid, current_user_id), (conversation_uuid, other_user_id);
  end if;
  return conversation_uuid;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

commit;
