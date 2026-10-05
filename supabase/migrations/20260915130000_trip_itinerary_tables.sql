-- O roteiro deixa de ser um blob e vira linhas.
--
-- POR QUE
--
-- `travel_plans.plan_data` guarda a viagem inteira num jsonb. Com um dono só isso
-- nunca incomodou: quem salva é quem tinha acabado de ler. Com duas pessoas
-- editando, gravar o documento inteiro é last-write-wins — a Vero adiciona uma
-- parada no dia 3, o Elvis remove uma do dia 1 dez segundos depois, e o `update`
-- dele reescreve o jsonb inteiro. O trabalho dela some sem erro nenhum, sem
-- conflito e sem aviso. Nenhuma trava de versão resolve isso de verdade: ela
-- apenas transforma "some em silêncio" em "recarregue e refaça".
--
-- Em linhas, cada parada é um alvo próprio: adicionar uma não toca nas outras,
-- remover uma é um delete, e dois editores mexendo em dias diferentes nem se
-- encostam. É também o que permite, depois, realtime por linha (o app já tem
-- canal realtime para mensagens).
--
-- plan_data CONTINUA, e continua sendo escrito, como rede de segurança: enquanto
-- esta fase não estiver validada em produção, dá para voltar atrás sem perder
-- roteiro nenhum. O caminho de leitura e escrita do app passa a ser estas tabelas;
-- o jsonb vira cópia, não fonte.

begin;

-- ── Dias ─────────────────────────────────────────────────────────────────────

create table if not exists public.trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.travel_plans (id) on delete cascade,

  -- O número que o usuário vê ("Dia 3"), e a ordem do roteiro. Único por viagem:
  -- dois "dia 3" na mesma viagem é dado quebrado, não uma preferência.
  day_number integer not null check (day_number >= 1),

  date date,
  theme text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (trip_id, day_number),
  -- Alvo do FK composto de trip_activities: é o que impede uma atividade de
  -- apontar para um dia de OUTRA viagem.
  unique (id, trip_id)
);

create index if not exists trip_days_trip_idx
  on public.trip_days (trip_id, day_number);

-- ── Atividades ───────────────────────────────────────────────────────────────

create table if not exists public.trip_activities (
  id uuid primary key default gen_random_uuid(),

  -- `trip_id` repetido de propósito: sem ele, toda policy e todo índice de
  -- atividade precisaria de um join com trip_days. O FK composto abaixo garante
  -- que ele nunca discorde do dia.
  trip_id uuid not null references public.travel_plans (id) on delete cascade,
  day_id uuid not null references public.trip_days (id) on delete cascade,

  -- Ordem dentro do dia. NÃO é única: reordenar uma lista com posição única
  -- exige valores temporários a cada troca, e a reordenação é justamente a
  -- operação que esta tabela existe para tornar barata.
  position integer not null check (position >= 1),

  period text,
  title text not null,
  description text,
  location text,
  duration text,
  estimated_cost numeric check (estimated_cost is null or estimated_cost >= 0),
  currency text,
  map_query text,
  maps_url text,
  official_url text,
  purchase_note text,
  indoor boolean,

  latitude double precision check (latitude is null or abs(latitude) <= 90),
  longitude double precision check (longitude is null or abs(longitude) <= 180),
  -- De onde veio a coordenada e se ela é aproximada — o app já carrega isso e
  -- usa para decidir o que plotar.
  coordinate_source text,
  approximate_coordinate boolean,

  -- Mesmo enum de planGeography.PLACE_CATEGORIES e da Edge Function.
  category text not null default 'outro'
    check (category in ('restaurante','atracao','compras','hotel','transporte','natureza','vida_noturna','outro')),

  rating numeric,
  review_count integer,
  opening_hours text[],
  verification_source text,
  place_id text,

  -- O que a IA mandar e este schema ainda não modelar. Existe para a migração
  -- ser SEM PERDA: um campo novo na Edge Function não some do roteiro só porque
  -- ninguém criou a coluna ainda.
  extra jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (day_id, trip_id) references public.trip_days (id, trip_id) on delete cascade
);

create index if not exists trip_activities_day_idx
  on public.trip_activities (day_id, position);
create index if not exists trip_activities_trip_idx
  on public.trip_activities (trip_id);

comment on table public.trip_activities is
  'Paradas do roteiro, uma por linha. A cópia em travel_plans.plan_data continua sendo gravada como fallback de rollback desta fase.';

-- ── updated_at ───────────────────────────────────────────────────────────────

create or replace function public.touch_trip_itinerary_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_trip_days_updated_at on public.trip_days;
create trigger touch_trip_days_updated_at
  before update on public.trip_days
  for each row execute function public.touch_trip_itinerary_updated_at();

drop trigger if exists touch_trip_activities_updated_at on public.trip_activities;
create trigger touch_trip_activities_updated_at
  before update on public.trip_activities
  for each row execute function public.touch_trip_itinerary_updated_at();

-- ── RLS: a mesma pergunta de travel_plans ────────────────────────────────────

alter table public.trip_days enable row level security;
alter table public.trip_activities enable row level security;

create policy "Members read trip days"
  on public.trip_days for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "Editors write trip days"
  on public.trip_days for all to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

create policy "Members read trip activities"
  on public.trip_activities for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "Editors write trip activities"
  on public.trip_activities for all to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id));

-- ── Migração dos roteiros que já existem ─────────────────────────────────────
--
-- Procedural, e não um `insert ... select`, por causa dos dados reais:
--
--   • roteiro antigo pode não ter `day` nenhum (o número vem da ordem do array);
--   • pode ter `day` repetido — e a unicidade (trip_id, day_number) recusaria a
--     segunda ocorrência, apagando um dia inteiro do roteiro de alguém;
--   • `estimatedCost` às vezes veio como string ("120"), às vezes como número;
--   • coordenada pode ser nula, 0,0 ("Null Island") ou fora de faixa;
--   • `plan_data` pode ser `{}` (roteiro que falhou na geração).
--
-- A regra é não perder nada e não inventar nada: o que não couber numa coluna vai
-- para `extra`, e o que for inválido vira null em vez de virar dado errado.
do $$
declare
  viagem record;
  dia jsonb;
  atividade jsonb;
  ordem_dia integer;
  ordem_atividade integer;
  numero_dia integer;
  usados integer[];
  novo_dia_id uuid;
  coordenada_lat double precision;
  coordenada_lng double precision;
begin
  for viagem in
    select id, plan_data from public.travel_plans
     where jsonb_typeof(plan_data -> 'days') = 'array'
  loop
    -- Idempotência: rodar a migração duas vezes não duplica roteiro.
    if exists (select 1 from public.trip_days where trip_id = viagem.id) then
      continue;
    end if;

    ordem_dia := 0;
    usados := '{}';

    for dia in select * from jsonb_array_elements(viagem.plan_data -> 'days')
    loop
      ordem_dia := ordem_dia + 1;

      -- O número declarado, quando for um inteiro positivo e ainda livre nesta
      -- viagem; senão, a posição no array.
      numero_dia := null;
      if jsonb_typeof(dia -> 'day') = 'number' then
        numero_dia := floor((dia ->> 'day')::numeric)::integer;
      elsif jsonb_typeof(dia -> 'day') = 'string' and (dia ->> 'day') ~ '^[0-9]+$' then
        numero_dia := (dia ->> 'day')::integer;
      end if;

      if numero_dia is null or numero_dia < 1 or numero_dia = any(usados) then
        numero_dia := ordem_dia;
      end if;
      -- A posição no array também pode colidir (roteiro com "dia 1" declarado na
      -- segunda posição). Nesse caso, o primeiro número livre.
      while numero_dia = any(usados) loop
        numero_dia := numero_dia + 1;
      end loop;
      usados := usados || numero_dia;

      insert into public.trip_days (trip_id, day_number, date, theme)
      values (
        viagem.id,
        numero_dia,
        case when (dia ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' then (dia ->> 'date')::date else null end,
        nullif(dia ->> 'theme', '')
      )
      returning id into novo_dia_id;

      ordem_atividade := 0;
      if jsonb_typeof(dia -> 'activities') = 'array' then
        for atividade in select * from jsonb_array_elements(dia -> 'activities')
        loop
          ordem_atividade := ordem_atividade + 1;

          coordenada_lat := case
            when jsonb_typeof(atividade -> 'latitude') = 'number'
             and abs((atividade ->> 'latitude')::double precision) <= 90
            then (atividade ->> 'latitude')::double precision end;
          coordenada_lng := case
            when jsonb_typeof(atividade -> 'longitude') = 'number'
             and abs((atividade ->> 'longitude')::double precision) <= 180
            then (atividade ->> 'longitude')::double precision end;

          -- (0, 0) é "Null Island": quase sempre campo vazio, não um lugar.
          -- Mesma regra de planGeography.isValidCoordinate.
          if coordenada_lat = 0 and coordenada_lng = 0 then
            coordenada_lat := null;
            coordenada_lng := null;
          end if;

          insert into public.trip_activities (
            trip_id, day_id, position, period, title, description, location, duration,
            estimated_cost, currency, map_query, maps_url, official_url, purchase_note, indoor,
            latitude, longitude, coordinate_source, approximate_coordinate, category,
            rating, review_count, opening_hours, verification_source, place_id, extra
          )
          values (
            viagem.id,
            novo_dia_id,
            ordem_atividade,
            nullif(atividade ->> 'period', ''),
            -- `title` é not null: roteiro antigo sem título vira um rótulo
            -- honesto em vez de impedir a migração da viagem inteira.
            coalesce(nullif(atividade ->> 'title', ''), 'Parada sem título'),
            nullif(atividade ->> 'description', ''),
            nullif(atividade ->> 'location', ''),
            nullif(atividade ->> 'duration', ''),
            case
              when jsonb_typeof(atividade -> 'estimatedCost') = 'number'
                then (atividade ->> 'estimatedCost')::numeric
              when (atividade ->> 'estimatedCost') ~ '^[0-9]+(\.[0-9]+)?$'
                then (atividade ->> 'estimatedCost')::numeric
              else null
            end,
            nullif(atividade ->> 'currency', ''),
            nullif(atividade ->> 'mapQuery', ''),
            nullif(atividade ->> 'mapsUrl', ''),
            nullif(atividade ->> 'officialUrl', ''),
            nullif(atividade ->> 'purchaseNote', ''),
            case when jsonb_typeof(atividade -> 'indoor') = 'boolean'
                 then (atividade ->> 'indoor')::boolean end,
            coordenada_lat,
            coordenada_lng,
            nullif(atividade ->> 'coordinateSource', ''),
            case when jsonb_typeof(atividade -> 'approximateCoordinate') = 'boolean'
                 then (atividade ->> 'approximateCoordinate')::boolean end,
            case
              when atividade ->> 'category' in
                ('restaurante','atracao','compras','hotel','transporte','natureza','vida_noturna','outro')
              then atividade ->> 'category'
              else 'outro'
            end,
            case when jsonb_typeof(atividade -> 'rating') = 'number'
                 then (atividade ->> 'rating')::numeric end,
            case when jsonb_typeof(atividade -> 'reviewCount') = 'number'
                 then (atividade ->> 'reviewCount')::integer end,
            case when jsonb_typeof(atividade -> 'openingHours') = 'array'
                 then array(select jsonb_array_elements_text(atividade -> 'openingHours')) end,
            nullif(atividade ->> 'verificationSource', ''),
            nullif(atividade ->> 'placeId', ''),
            -- Tudo que não tem coluna, preservado.
            (atividade - 'period' - 'title' - 'description' - 'location' - 'duration'
                       - 'estimatedCost' - 'currency' - 'mapQuery' - 'mapsUrl' - 'officialUrl'
                       - 'purchaseNote' - 'indoor' - 'latitude' - 'longitude'
                       - 'coordinateSource' - 'approximateCoordinate' - 'category'
                       - 'rating' - 'reviewCount' - 'openingHours' - 'verificationSource'
                       - 'placeId' - 'order')
          );
        end loop;
      end if;
    end loop;
  end loop;
end;
$$;

-- ── Escrita do roteiro inteiro, em uma transação ─────────────────────────────
--
-- É o caminho que o app usa quando a IA devolve (ou regenera) um roteiro: troca
-- tudo de uma vez. A edição fina — mover uma parada, apagar outra — é feita
-- direto nas tabelas, que é justamente o ganho de ter normalizado.
--
-- security invoker: quem não pode editar a viagem não escreve nada, porque as
-- policies acima continuam valendo dentro da função.
create or replace function public.replace_trip_itinerary(p_trip_id uuid, p_days jsonb)
returns void
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
  novo_dia_id uuid;
begin
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'replace_trip_itinerary: p_days precisa ser um array de dias';
  end if;

  -- O cascade de trip_days leva as atividades junto.
  delete from public.trip_days where trip_id = p_trip_id;

  for dia in select * from jsonb_array_elements(p_days)
  loop
    ordem_dia := ordem_dia + 1;

    -- O número do dia é o declarado, quando for número de verdade e ainda estiver
    -- livre. Um `day` malformado ("a") faria o cast levantar e derrubar o
    -- salvamento inteiro; um `day` repetido esbarraria em unique (trip_id,
    -- day_number) e faria o mesmo. Nos dois casos vale a posição no array.
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

    insert into public.trip_days (trip_id, day_number, date, theme)
    values (
      p_trip_id,
      numero_dia,
      case when (dia ->> 'date') ~ '^\d{4}-\d{2}-\d{2}$' then (dia ->> 'date')::date else null end,
      nullif(dia ->> 'theme', '')
    )
    returning id into novo_dia_id;

    ordem_atividade := 0;
    if jsonb_typeof(dia -> 'activities') = 'array' then
      for atividade in select * from jsonb_array_elements(dia -> 'activities')
      loop
        ordem_atividade := ordem_atividade + 1;

        insert into public.trip_activities (
          trip_id, day_id, position, period, title, description, location, duration,
          estimated_cost, map_query, official_url, purchase_note, indoor,
          latitude, longitude, category
        )
        values (
          p_trip_id,
          novo_dia_id,
          ordem_atividade,
          nullif(atividade ->> 'period', ''),
          coalesce(nullif(atividade ->> 'title', ''), 'Parada sem título'),
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
          case
            when atividade ->> 'category' in
              ('restaurante','atracao','compras','hotel','transporte','natureza','vida_noturna','outro')
            then atividade ->> 'category'
            else 'outro'
          end
        );
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function public.replace_trip_itinerary(uuid, jsonb) from public, anon;
grant execute on function public.replace_trip_itinerary(uuid, jsonb) to authenticated;

commit;
