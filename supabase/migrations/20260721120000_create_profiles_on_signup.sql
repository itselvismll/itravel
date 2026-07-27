-- Create profiles in a trusted database context so email-confirmation signups
-- do not depend on a client session that does not exist yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, full_name, display_name, avatar_url, bio)
  values (
    new.id,
    coalesce(
      nullif(lower(trim(new.raw_user_meta_data ->> 'username')), ''),
      'traveler_' || substr(new.id::text, 1, 8)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    null,
    null
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(candidate))
  );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.keep_alive()
returns timestamptz
language sql
stable
security definer set search_path = ''
as $$
  select now();
$$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;
