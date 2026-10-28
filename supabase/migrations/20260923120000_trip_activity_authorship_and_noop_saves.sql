-- Salvar sem mudar nada deixa de ser uma edição. E "editado por" passa a
-- significar alguém ter editado.
--
-- O BUG (confirmado em 22/09/2026: a Vero abriu o editor, não mudou nada, e os
-- outros participantes receberam "Vero editou a viagem")
--
-- O aviso não sai do botão Editar — ele não grava nada. Sai de "Atualizar
-- roteiro", e a causa está no banco: `sync_trip_itinerary` faz `update` em TODA
-- parada e em TODO dia que já existe, mudou ou não. Um update que regrava os
-- mesmos valores ainda é um update para o Postgres, então a cada salvamento:
--
--   1. `log_trip_activity_edit` registra "atualizou" para todas as paradas, e
--      `log_trip_edit` manda o aviso;
--   2. `stamp_trip_itinerary_editor` carimba quem salvou como `last_edited_by`
--      em TODAS as linhas — a coluna que a tela vai usar para "editado por";
--   3. `touch_trip_itinerary_updated_at` avança `updated_at` de todas as linhas,
--      e a guarda de conflito do sync passa a acusar conflito no salvamento
--      seguinte de OUTRA pessoa em paradas que ninguém tocou.
--
-- E havia um quarto caminho, mais escondido: a ida e volta banco → app → banco
-- não era fiel. O app lê custo ausente como 0 e `indoor` ausente como false, e
-- o sync gravava esses valores de volta. Mesmo sem ninguém tocar em nada, a linha
-- MUDAVA (null → 0), e nenhuma comparação de "mudou?" teria salvado o caso.
--
-- O CONSERTO, EM TRÊS PEÇAS
--
--   a) `skip_unchanged_*`: o trigger nativo do Postgres que descarta update
--      idêntico. É a primeira coisa a rodar (triggers do mesmo momento disparam em
--      ordem alfabética: skip < stamp < touch), então um update que não muda nada
--      não chega a existir — nem updated_at, nem carimbo, nem log, nem aviso. Vale
--      para QUALQUER caminho de escrita, não só o sync.
--
--   b) `trip_activity_content_changed(old, new)`: a ÚNICA definição de "a parada
--      foi editada". Posição e dia ficam de fora: apagar a parada 2 empurra a 3, a
--      4 e a 5 uma casa para cima, e isso não é ninguém editando a 3, a 4 e a 5.
--      O carimbo de autoria e o log (de onde sai o aviso) perguntam as duas a esta
--      função — "mudou algo?" mora num lugar só.
--
--   c) `sync_trip_itinerary` deixa de transformar ausente em zero.
--
-- A AUTORIA
--
-- `created_by` (novo), `last_edited_by` (já existia) e `last_edited_at` (novo).
-- A tela mostra "editado por X" quando `last_edited_by` existe e é diferente de
-- `created_by` — quem ajusta a própria parada não ganha tag, senão a viagem de uma
-- pessoa só ficaria com "editado por você" em cada cartão.
--
-- As três colunas são escritas SÓ pelo trigger, com `auth.uid()`. O que o cliente
-- mandar nelas é descartado: um PATCH direto com `last_edited_by` de outra pessoa
-- volta ao valor anterior. Não há policy de coluna para manter — o trigger é a
-- regra, e roda para todo caminho de escrita, inclusive dentro do sync (que é
-- security invoker, então `auth.uid()` ali é quem está salvando).
--
-- ORDEM DE DEPLOY: esta migração ANTES do app. O app novo pede `created_by` e
-- `last_edited_at` na leitura da viagem; sem as colunas, o PostgREST recusa o
-- embed e a lista de viagens cai no caminho degradado (sem roteiro normalizado).

begin;

-- ── As colunas ──────────────────────────────────────────────────────────────

alter table public.trip_activities
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists last_edited_at timestamptz;

comment on column public.trip_activities.created_by is
  'Quem criou a parada. Escrito só pelo trigger stamp_trip_activity_authorship, com auth.uid().';
comment on column public.trip_activities.last_edited_by is
  'Último a EDITAR o conteúdo da parada (ver trip_activity_content_changed). Nulo enquanto ninguém editou depois de criar. Escrito só por trigger.';
comment on column public.trip_activities.last_edited_at is
  'Quando last_edited_by editou. Escrito só por trigger.';

-- ── Os dados que já existem ─────────────────────────────────────────────────
--
-- `last_edited_by` de hoje NÃO é confiável: por causa do bug, ele aponta para
-- quem apertou "Atualizar roteiro" por último, em todas as paradas da viagem.
-- Manter o valor seria pôr "editado por Vero" em paradas que a Vero nunca tocou.
-- Então ele zera, e a atribuição começa a valer a partir desta migração. As
-- edições reais anteriores são indistinguíveis dos salvamentos vazios — o log
-- também registrou "updated" para todos.
--
-- `created_by` sai do log quando ele registrou a criação (paradas criadas depois
-- de 17/09); senão, do dono da viagem, que é quem gerou os roteiros antigos.
--
-- Com os triggers de usuário DESLIGADOS durante o backfill. Ligados, o touch
-- avançaria o `updated_at` de todas as paradas, e quem estivesse com uma viagem
-- aberta tomaria conflito em todas elas no próximo salvamento. (As FKs são
-- triggers de sistema e continuam valendo.)
alter table public.trip_activities disable trigger user;

update public.trip_activities a
   set created_by = coalesce(
         (select l.actor_id
            from public.trip_edit_log l
           where l.item_id = a.id::text
             and l.area = 'itinerary'
             and l.action = 'created'
           order by l.created_at
           limit 1),
         (select p.user_id from public.travel_plans p where p.id = a.trip_id)
       ),
       last_edited_by = null,
       last_edited_at = null;

alter table public.trip_activities enable trigger user;

-- ── (a) Update idêntico não acontece ────────────────────────────────────────

drop trigger if exists skip_unchanged_trip_activities on public.trip_activities;
create trigger skip_unchanged_trip_activities
  before update on public.trip_activities
  for each row execute function suppress_redundant_updates_trigger();

drop trigger if exists skip_unchanged_trip_days on public.trip_days;
create trigger skip_unchanged_trip_days
  before update on public.trip_days
  for each row execute function suppress_redundant_updates_trigger();

-- ── (b) O que conta como editar uma parada ──────────────────────────────────
--
-- Tudo que a pessoa vê e escreve no cartão. Fora: identidade (id, trip_id),
-- estrutura (day_id, position), e as colunas mantidas por trigger (created_at,
-- updated_at, created_by, last_edited_by, last_edited_at).
create or replace function public.trip_activity_content_changed(
  old_row public.trip_activities,
  new_row public.trip_activities
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (
    old_row.period, old_row.title, old_row.description, old_row.location,
    old_row.duration, old_row.estimated_cost, old_row.currency, old_row.map_query,
    old_row.maps_url, old_row.official_url, old_row.purchase_note, old_row.indoor,
    old_row.latitude, old_row.longitude, old_row.coordinate_source,
    old_row.approximate_coordinate, old_row.category, old_row.rating,
    old_row.review_count, old_row.opening_hours, old_row.verification_source,
    old_row.place_id, old_row.extra
  ) is distinct from (
    new_row.period, new_row.title, new_row.description, new_row.location,
    new_row.duration, new_row.estimated_cost, new_row.currency, new_row.map_query,
    new_row.maps_url, new_row.official_url, new_row.purchase_note, new_row.indoor,
    new_row.latitude, new_row.longitude, new_row.coordinate_source,
    new_row.approximate_coordinate, new_row.category, new_row.rating,
    new_row.review_count, new_row.opening_hours, new_row.verification_source,
    new_row.place_id, new_row.extra
  )
$$;

comment on function public.trip_activity_content_changed(public.trip_activities, public.trip_activities) is
  'A única definição de "a parada foi editada". Usada pelo carimbo de autoria e pelo log/aviso de edição. Posição e dia não contam.';

-- ── A autoria, escrita só pelo servidor ─────────────────────────────────────

create or replace function public.stamp_trip_activity_authorship()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.last_edited_by := null;
    new.last_edited_at := null;
    return new;
  end if;

  -- UPDATE. O que veio do cliente nestas colunas nunca vale.
  new.created_by := old.created_by;

  if auth.uid() is not null and public.trip_activity_content_changed(old, new) then
    new.last_edited_by := auth.uid();
    new.last_edited_at := now();
  else
    -- Só mudou posição/dia, ou a escrita veio sem usuário (service role, cron):
    -- a autoria anterior continua sendo a verdade.
    new.last_edited_by := old.last_edited_by;
    new.last_edited_at := old.last_edited_at;
  end if;

  return new;
end;
$$;

-- Mesmo nome de antes, para manter a ordem (skip < stamp < touch). Os dias
-- continuam com stamp_trip_itinerary_editor: não mostram tag, e o skip já
-- impede o carimbo em salvamento vazio.
drop trigger if exists stamp_trip_activities_editor on public.trip_activities;
create trigger stamp_trip_activities_editor
  before insert or update on public.trip_activities
  for each row execute function public.stamp_trip_activity_authorship();

-- ── O log (e o aviso) perguntam a mesma coisa ───────────────────────────────

create or replace function public.log_trip_activity_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.log_trip_edit(old.trip_id, 'itinerary', 'deleted', old.id::text, old.title);
    return old;
  end if;

  -- A parada só andou de lugar (vizinha apagada, dia reordenado): não é edição
  -- dela, e não vira histórico nem aviso. A edição que causou o movimento já
  -- registrou o próprio log.
  if tg_op = 'UPDATE' and not public.trip_activity_content_changed(old, new) then
    return new;
  end if;

  perform public.log_trip_edit(
    new.trip_id,
    'itinerary',
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    new.id::text,
    new.title
  );
  return new;
end;
$$;

-- ── (c) O sync para de transformar ausente em zero ──────────────────────────
--
-- Igual à versão de 20260917140000, com uma diferença só, no UPDATE da parada:
-- `estimatedCost` 0 sobre um custo NULO e `indoor` false sobre um NULO mantêm o
-- nulo. É o default que o app pôs na leitura (activityFromRow) voltando, não uma
-- escolha de ninguém — e gravá-lo fazia toda parada sem custo "mudar" a cada
-- salvamento, derrubando o skip de update idêntico.

create or replace function public.sync_trip_itinerary(p_trip_id uuid, p_days jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  dia jsonb;
  atividade jsonb;
  ordem_dia integer := 0;
  ordem_atividade integer;
  numero_dia integer;
  usados integer[] := '{}';
  dia_id uuid;
  atividade_id uuid;
  dias_mantidos uuid[] := '{}';
  atividades_mantidas uuid[] := '{}';
  base timestamptz;
  atual timestamptz;
  inseridos integer := 0;
  atualizados integer := 0;
  removidos integer := 0;
  conflitos integer := 0;
  linhas integer;
begin
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'sync_trip_itinerary: p_days precisa ser um array de dias';
  end if;

  for dia in select * from jsonb_array_elements(p_days)
  loop
    ordem_dia := ordem_dia + 1;

    numero_dia := null;
    if jsonb_typeof(dia -> 'day') = 'number' then
      numero_dia := floor((dia ->> 'day')::numeric)::integer;
    elsif jsonb_typeof(dia -> 'day') = 'string' and (dia ->> 'day') ~ '^[0-9]+$' then
      numero_dia := (dia ->> 'day')::integer;
    end if;

    if numero_dia is null or numero_dia < 1 then
      numero_dia := ordem_dia;
    end if;
    while numero_dia = any(usados) loop
      numero_dia := numero_dia + 1;
    end loop;
    usados := usados || numero_dia;

    dia_id := null;
    if jsonb_typeof(dia -> 'id') = 'string' and (dia ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then
      select id into dia_id
        from public.trip_days
       where id = (dia ->> 'id')::uuid and trip_id = p_trip_id;
    end if;

    if dia_id is null then
      insert into public.trip_days (trip_id, day_number, date, theme)
      values (
        p_trip_id,
        numero_dia,
        case when (dia ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' then (dia ->> 'date')::date else null end,
        nullif(dia ->> 'theme', '')
      )
      returning id into dia_id;
      inseridos := inseridos + 1;
    else
      update public.trip_days
         set day_number = numero_dia,
             date = case when (dia ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' then (dia ->> 'date')::date else null end,
             theme = nullif(dia ->> 'theme', '')
       where id = dia_id;
    end if;

    dias_mantidos := dias_mantidos || dia_id;

    ordem_atividade := 0;
    if jsonb_typeof(dia -> 'activities') = 'array' then
      for atividade in select * from jsonb_array_elements(dia -> 'activities')
      loop
        ordem_atividade := ordem_atividade + 1;

        base := null;
        if jsonb_typeof(atividade -> 'updatedAt') = 'string' then
          begin
            base := (atividade ->> 'updatedAt')::timestamptz;
          exception when others then
            base := null;
          end;
        end if;

        atual := null;
        if jsonb_typeof(atividade -> 'id') = 'string'
           and (atividade ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then
          select updated_at into atual
            from public.trip_activities
           where id = (atividade ->> 'id')::uuid and trip_id = p_trip_id;
        end if;

        if atual is null then
          insert into public.trip_activities (
            trip_id, day_id, position, period, title, description, location, duration,
            estimated_cost, map_query, official_url, purchase_note, indoor,
            latitude, longitude, category
          )
          values (
            p_trip_id, dia_id, ordem_atividade,
            nullif(atividade ->> 'period', ''),
            coalesce(nullif(atividade ->> 'title', ''), 'Parada'),
            nullif(atividade ->> 'description', ''),
            nullif(atividade ->> 'location', ''),
            nullif(atividade ->> 'duration', ''),
            case when jsonb_typeof(atividade -> 'estimatedCost') = 'number'
                 then (atividade ->> 'estimatedCost')::numeric end,
            nullif(atividade ->> 'mapQuery', ''),
            nullif(atividade ->> 'officialUrl', ''),
            nullif(atividade ->> 'purchaseNote', ''),
            case when jsonb_typeof(atividade -> 'indoor') = 'boolean'
                 then (atividade ->> 'indoor')::boolean end,
            case when jsonb_typeof(atividade -> 'latitude') = 'number'
                 then (atividade ->> 'latitude')::double precision end,
            case when jsonb_typeof(atividade -> 'longitude') = 'number'
                 then (atividade ->> 'longitude')::double precision end,
            coalesce(nullif(atividade ->> 'category', ''), 'outro')
          )
          returning id into atividade_id;
          inseridos := inseridos + 1;
          atividades_mantidas := atividades_mantidas || atividade_id;

        elsif base is not null and atual > base then
          conflitos := conflitos + 1;
          atividades_mantidas := atividades_mantidas || (atividade ->> 'id')::uuid;

        else
          -- Nas colunas à direita do `=`, o nome da coluna é o valor ATUAL da
          -- linha — é o que permite "0 sobre nulo continua nulo".
          update public.trip_activities
             set day_id = dia_id,
                 position = ordem_atividade,
                 period = nullif(atividade ->> 'period', ''),
                 title = coalesce(nullif(atividade ->> 'title', ''), 'Parada'),
                 description = nullif(atividade ->> 'description', ''),
                 location = nullif(atividade ->> 'location', ''),
                 duration = nullif(atividade ->> 'duration', ''),
                 estimated_cost = case
                   when jsonb_typeof(atividade -> 'estimatedCost') <> 'number' then null
                   when estimated_cost is null and (atividade ->> 'estimatedCost')::numeric = 0 then null
                   else (atividade ->> 'estimatedCost')::numeric
                 end,
                 map_query = nullif(atividade ->> 'mapQuery', ''),
                 official_url = nullif(atividade ->> 'officialUrl', ''),
                 purchase_note = nullif(atividade ->> 'purchaseNote', ''),
                 indoor = case
                   when jsonb_typeof(atividade -> 'indoor') <> 'boolean' then null
                   when indoor is null and not (atividade ->> 'indoor')::boolean then null
                   else (atividade ->> 'indoor')::boolean
                 end,
                 latitude = case when jsonb_typeof(atividade -> 'latitude') = 'number'
                                 then (atividade ->> 'latitude')::double precision end,
                 longitude = case when jsonb_typeof(atividade -> 'longitude') = 'number'
                                  then (atividade ->> 'longitude')::double precision end,
                 category = coalesce(nullif(atividade ->> 'category', ''), 'outro')
           where id = (atividade ->> 'id')::uuid;
          -- Conta só o que de fato mudou: o skip_unchanged descarta o update
          -- idêntico e o row_count vem 0.
          get diagnostics linhas = row_count;
          atualizados := atualizados + linhas;
          atividades_mantidas := atividades_mantidas || (atividade ->> 'id')::uuid;
        end if;
      end loop;
    end if;
  end loop;

  delete from public.trip_activities
   where trip_id = p_trip_id
     and not (id = any(atividades_mantidas));
  get diagnostics removidos = row_count;

  delete from public.trip_days
   where trip_id = p_trip_id
     and not (id = any(dias_mantidos));

  return jsonb_build_object(
    'inserted', inseridos,
    'updated', atualizados,
    'deleted', removidos,
    'conflicts', conflitos
  );
end;
$$;

revoke all on function public.sync_trip_itinerary(uuid, jsonb) from public, anon;
grant execute on function public.sync_trip_itinerary(uuid, jsonb) to authenticated;

commit;
