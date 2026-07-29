begin;

-- Repair authentication accounts that still have no public profile. A complete
-- profile is required by avatar updates, comments, notifications, and feed
-- author rendering.
with ranked_users as (
  select
    auth_user.id,
    auth_user.raw_user_meta_data,
    lower(nullif(trim(auth_user.raw_user_meta_data ->> 'username'), '')) as requested_username,
    row_number() over (
      partition by lower(nullif(trim(auth_user.raw_user_meta_data ->> 'username'), ''))
      order by auth_user.created_at, auth_user.id
    ) as username_rank
  from auth.users as auth_user
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
    nullif(trim(ranked.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(ranked.raw_user_meta_data ->> 'name'), '')
  ),
  coalesce(
    nullif(trim(ranked.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(ranked.raw_user_meta_data ->> 'picture'), '')
  )
from ranked_users as ranked
where not exists (
  select 1
  from public.profiles as profile
  where profile.id = ranked.id
)
on conflict (id) do nothing;

create or replace function public.ensure_current_user_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_user auth.users%rowtype;
  requested_username text;
  selected_username text;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = auth.uid()
  ) then
    return;
  end if;

  select *
    into auth_user
  from auth.users
  where id = auth.uid();

  if auth_user.id is null then
    raise exception 'Conta de autenticação não encontrada';
  end if;

  requested_username := lower(
    nullif(trim(auth_user.raw_user_meta_data ->> 'username'), '')
  );

  if requested_username ~ '^[a-z0-9_]{3,30}$'
    and not exists (
      select 1
      from public.profiles
      where lower(username) = requested_username
    )
  then
    selected_username := requested_username;
  else
    selected_username := 'traveler_'
      || substr(replace(auth_user.id::text, '-', ''), 1, 12);
  end if;

  begin
    insert into public.profiles (
      id,
      username,
      display_name,
      avatar_url
    )
    values (
      auth_user.id,
      selected_username,
      coalesce(
        nullif(trim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
      ),
      coalesce(
        nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(trim(auth_user.raw_user_meta_data ->> 'picture'), '')
      )
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
        auth_user.id,
        'traveler_' || substr(replace(auth_user.id::text, '-', ''), 1, 12),
        coalesce(
          nullif(trim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
          nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
          nullif(trim(auth_user.raw_user_meta_data ->> 'name'), '')
        ),
        coalesce(
          nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
          nullif(trim(auth_user.raw_user_meta_data ->> 'picture'), '')
        )
      )
      on conflict (id) do nothing;
  end;
end;
$$;

revoke all on function public.ensure_current_user_profile() from public;
grant execute on function public.ensure_current_user_profile() to authenticated;

-- Keep future email and Google signups consistent with the repair routine.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
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
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), '')
      ),
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
      )
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
          nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
          nullif(trim(new.raw_user_meta_data ->> 'name'), '')
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
          nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
        )
      )
      on conflict (id) do nothing;
  end;

  return new;
end;
$$;

commit;
