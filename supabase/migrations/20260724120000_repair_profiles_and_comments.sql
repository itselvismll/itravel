begin;

-- Older accounts may predate the profile trigger. Missing profile rows break
-- profile edits and foreign keys that use profiles.id, including comments.
with ranked_users as (
  select
    users.id,
    users.raw_user_meta_data,
    lower(nullif(trim(users.raw_user_meta_data ->> 'username'), '')) as requested_username,
    row_number() over (
      partition by lower(nullif(trim(users.raw_user_meta_data ->> 'username'), ''))
      order by users.created_at, users.id
    ) as username_rank
  from auth.users as users
)
insert into public.profiles (
  id,
  username,
  display_name,
  avatar_url
)
select
  ranked.id,
  case
    when ranked.requested_username ~ '^[a-z0-9_]{3,30}$'
      and ranked.username_rank = 1
      and not exists (
        select 1
        from public.profiles as existing
        where lower(existing.username) = ranked.requested_username
      )
      then ranked.requested_username
    else 'traveler_' || substr(replace(ranked.id::text, '-', ''), 1, 12)
  end,
  coalesce(
    nullif(trim(ranked.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(ranked.raw_user_meta_data ->> 'full_name'), '')
  ),
  nullif(trim(ranked.raw_user_meta_data ->> 'avatar_url'), '')
from ranked_users as ranked
where not exists (
  select 1
  from public.profiles as profile
  where profile.id = ranked.id
)
on conflict (id) do nothing;

-- Keep future signups safe even if two requests race for the same username.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  requested_username text;
  selected_username text;
begin
  requested_username := lower(nullif(trim(new.raw_user_meta_data ->> 'username'), ''));

  if requested_username ~ '^[a-z0-9_]{3,30}$'
    and not exists (
      select 1
      from public.profiles
      where lower(username) = requested_username
    )
  then
    selected_username := requested_username;
  else
    selected_username := 'traveler_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;

  begin
    insert into public.profiles (
      id,
      username,
      display_name,
      avatar_url
    )
    values (
      new.id,
      selected_username,
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
      ),
      nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
    )
    on conflict (id) do nothing;
  exception
    when unique_violation then
      insert into public.profiles (
        id,
        username,
        display_name,
        avatar_url
      )
      values (
        new.id,
        'traveler_' || substr(replace(new.id::text, '-', ''), 1, 12),
        coalesce(
          nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
          nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
        ),
        nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
      )
      on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep this relationship explicit so PostgREST can embed comment authors.
alter table public.comments
  drop constraint if exists comments_user_id_fkey;

alter table public.comments
  add constraint comments_user_id_fkey
  foreign key (user_id)
  references public.profiles (id)
  on delete cascade
  not valid;

alter table public.comments
  validate constraint comments_user_id_fkey;

create index if not exists comments_photo_created_at_idx
  on public.comments (photo_id, created_at);

create or replace function public.is_username_available(
  candidate text,
  excluding_user_id uuid
)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select
    nullif(lower(trim(candidate)), '') is not null
    and not exists (
      select 1
      from public.profiles
      where lower(username) = lower(trim(candidate))
        and (excluding_user_id is null or id <> excluding_user_id)
    );
$$;

revoke all on function public.is_username_available(text, uuid) from public;
grant execute on function public.is_username_available(text, uuid) to anon, authenticated;

commit;
