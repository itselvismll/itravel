-- Correção do cadastro de novos usuários.
--
-- A migração 20260821120000_onboarding_completed.sql sobrescreveu
-- public.handle_new_user() com um INSERT que cita as colunas full_name e bio,
-- que não existem em public.profiles. Isso derrubava o trigger com o erro
-- 42703 (undefined_column) e o rollback aparecia no cliente como
-- "Database error saving new user", bloqueando todo cadastro novo (formulário
-- e Google).
--
-- Aqui restauramos o corpo endurecido de 20260729160000_ensure_profile_identity.sql
-- inserindo APENAS as colunas que existem de fato: id, username, display_name e
-- avatar_url. onboarding_completed fica de fora de propósito: a coluna já tem
-- default false, então a criação da conta não depende mais do trigger conhecer
-- esse campo — o que torna o cadastro imune a esse tipo de regressão.
begin;

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

-- Recria o trigger de forma defensiva: se ele tiver sido removido em algum
-- reparo manual, o cadastro voltaria a nascer sem perfil.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
