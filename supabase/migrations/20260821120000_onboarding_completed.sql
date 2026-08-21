-- Gatilho do onboarding de boas-vindas.
--
-- A verdade fica no perfil (e não em storage local) para o onboarding aparecer
-- uma única vez POR CONTA, em qualquer dispositivo ou navegador.
begin;

alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

-- Contas que já existem nunca devem ver o onboarding: elas já conhecem o app.
-- Só vale para quem foi criado antes desta migração; o default false continua
-- valendo para todo cadastro novo.
update public.profiles
  set onboarding_completed = true
  where onboarding_completed = false;

-- O trigger de cadastro escreve a linha do perfil; deixamos o campo explícito
-- para o valor não depender só do default da coluna.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (
    id, username, full_name, display_name, avatar_url, bio, onboarding_completed
  )
  values (
    new.id,
    coalesce(
      nullif(lower(trim(new.raw_user_meta_data ->> 'username')), ''),
      'traveler_' || substr(new.id::text, 1, 8)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    null,
    null,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

commit;
