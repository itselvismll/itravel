-- Username automatico gerado a partir do NOME, nao do id do usuario.
--
-- Ate aqui, quem entrava pelo Google (sem escolher username) recebia
-- 'traveler_' || substr(id, 1, 12) -- ex.: traveler_4f9affb7a51d. Isso vaza
-- metade do uuid da conta num campo publico e e feio de exibir.
--
-- Agora o trigger normaliza o nome vindo do provedor ("Matheus Lima Peres" ->
-- "matheuslim") e so cai num nome aleatorio curto quando o nome do provedor
-- nao produz nada valido. O id nunca mais entra no username.
--
-- A regra de formato e a mesma dos quatro pontos do app (src/utils/username.js):
-- ^[a-z0-9_]{3,10}$.
begin;

-- Normalizacao canonica, em SQL, espelhando o normalizeUsername do app:
-- minusculas, sem acento, sem espaco, so [a-z0-9_], no maximo 10 chars.
--
-- translate() em vez de unaccent() de proposito: unaccent e uma extensao que
-- pode nao estar instalada, e uma funcao de trigger que falha derruba o
-- cadastro inteiro -- exatamente o incidente que ja tivemos.
create or replace function public.normalize_username(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substr(
    regexp_replace(
      lower(
        translate(
          coalesce(raw, ''),
          'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
          'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
        )
      ),
      '[^a-z0-9_]', '', 'g'
    ),
    1, 10
  );
$$;

comment on function public.normalize_username(text) is
  'Normaliza um username para ^[a-z0-9_]{3,10}$. Espelha normalizeUsername() em src/utils/username.js.';

-- Primeiro username livre a partir de uma base ja normalizada.
-- Colidiu? Anexa 2, 3, 4... truncando a base para o TOTAL caber em 10 chars
-- ("matheuslim" + "2" vira "matheusli2", nao "matheuslim2").
-- Esgotou as tentativas? Devolve null e quem chama decide o fallback.
create or replace function public.first_available_username(base text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  candidate text;
  suffix text;
  attempt int := 1;
begin
  if base is null or length(base) < 3 then
    return null;
  end if;

  loop
    if attempt = 1 then
      candidate := base;
    else
      suffix := attempt::text;
      candidate := substr(base, 1, 10 - length(suffix)) || suffix;
    end if;

    if not exists (
      select 1 from public.profiles where lower(username) = candidate
    ) then
      return candidate;
    end if;

    attempt := attempt + 1;
    exit when attempt > 50;
  end loop;

  return null;
end;
$$;

comment on function public.first_available_username(text) is
  'Primeiro username livre a partir de uma base normalizada (base, base2, base3...), sempre dentro de 10 chars.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  name_base text;
  selected_username text;
begin
  -- 1. Username escolhido no cadastro por formulario: manda sempre.
  requested_username := public.normalize_username(
    nullif(trim(new.raw_user_meta_data ->> 'username'), '')
  );

  if requested_username ~ '^[a-z0-9_]{3,10}$'
    and not exists (
      select 1 from public.profiles where lower(username) = requested_username
    )
  then
    selected_username := requested_username;
  else
    -- 2. Sem username escolhido (Google OAuth): deriva do nome do provedor.
    name_base := public.normalize_username(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), '')
      )
    );

    -- Nome curto demais depois de normalizar ("Jo", "Al") vira base valida com
    -- digitos, em vez de ser descartado para o fallback generico.
    if length(name_base) between 1 and 2 then
      name_base := name_base || lpad((floor(random() * 1000))::int::text, 3, '0');
    end if;

    selected_username := public.first_available_username(name_base);

    -- 3. Fallback: nome ausente ou impossivel de normalizar (ex.: nome so em
    -- kanji, que o regexp remove por inteiro). 'trav' + 6 digitos = 10 chars
    -- exatos; 'traveler_' sozinho ja teria 9 e nao caberia com o numero.
    -- Digitos aleatorios, nunca o id.
    if selected_username is null then
      selected_username := public.first_available_username(
        'trav' || lpad((floor(random() * 1000000))::int::text, 6, '0')
      );
    end if;

    -- Cinto e suspensorio: se ate isso colidiu 50 vezes, outro sorteio.
    if selected_username is null then
      selected_username := 'tr' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    end if;
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
    -- Corrida entre dois cadastros que escolheram o mesmo username no intervalo
    -- entre a checagem e o insert. Segunda tentativa com nome aleatorio.
    when unique_violation then
      insert into public.profiles (
        id,
        username,
        display_name,
        avatar_url
      )
      values (
        new.id,
        'tr' || lpad((floor(random() * 100000000))::bigint::text, 8, '0'),
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
