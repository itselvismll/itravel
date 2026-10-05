-- Salvar o roteiro SEM apagar o roteiro.
--
-- O QUE `replace_trip_itinerary` FAZ, E POR QUE ISSO DEIXOU DE SERVIR
--
-- Ela começa com `delete from trip_days where trip_id = ...` e reinsere tudo. Para
-- uma viagem de um dono só isso era simples e correto. Com dois editores e com o
-- histórico da Fase 2, quebra três coisas ao mesmo tempo:
--
--   1. o histórico vira ruído: cada salvamento gera "apagou a parada Coliseu"
--      seguido de "criou a parada Coliseu", para TODAS as paradas;
--   2. `last_edited_by` deixa de significar algo: como toda linha é recriada por
--      quem salvou, todo mundo aparece como último a editar tudo;
--   3. as linhas ganham ids novos a cada save, então `trip_edit_log.item_id` não
--      aponta para nada estável e a tela não consegue dizer "esta parada aqui".
--
-- E o principal: o trabalho do outro se perde. Duas pessoas abrem a viagem, as
-- duas salvam — a segunda apaga o roteiro e escreve o dela.
--
-- O QUE ESTA FUNÇÃO FAZ DIFERENTE
--
-- Sincroniza por IDENTIDADE em vez de recriar: casa pelo `id` que o app agora
-- carrega na ida e na volta, atualiza o que mudou, insere o que é novo e apaga o
-- que saiu. Os ids sobrevivem, e com eles a autoria e o histórico.
--
-- E GUARDA DE CONFLITO POR ITEM. Sincronizar por id, sozinho, ainda perde
-- trabalho: se a Vero carregou a viagem, o Elvis salvou uma mudança na parada 3 e
-- só então a Vero salva, o payload dela ainda traz a versão ANTIGA da parada 3 e
-- o update a reverteria sem avisar. Então cada item viaja com o `updated_at` que
-- o app leu, e o update só acontece se a linha não mudou desde então. Item mais
-- novo no banco é PRESERVADO e contado como conflito — o app avisa que algumas
-- mudanças de outra pessoa foram mantidas.
--
-- Isso não é edição simultânea de verdade (para isso cada campo precisaria viajar
-- sozinho). É a garantia de que ninguém perde trabalho em silêncio, que é o que
-- faltava.

begin;

-- ── O que cada item de payload precisa trazer ────────────────────────────────
--
-- day:      { id?, day, date, theme, updatedAt?, activities: [...] }
-- activity: { id?, order, title, ..., updatedAt? }
--
-- `id` ausente = item novo (roteiro recém-gerado pela IA não tem id nenhum).
-- `updatedAt` ausente = "não sei de que versão eu parti": nesse caso o update
-- passa, porque recusar faria o primeiro salvamento depois de gerar falhar.

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
begin
  if jsonb_typeof(p_days) <> 'array' then
    raise exception 'sync_trip_itinerary: p_days precisa ser um array de dias';
  end if;

  -- A permissão é a da RLS (security invoker): `can_edit_trip` recusa viewer e
  -- convidado pendente. Não há checagem aqui de propósito — duplicá-la daria duas
  -- fontes da verdade para a mesma regra.

  for dia in select * from jsonb_array_elements(p_days)
  loop
    ordem_dia := ordem_dia + 1;

    -- O número do dia é o declarado, quando for número de verdade e ainda estiver
    -- livre. `day` malformado ("a") faria o cast levantar e derrubar o salvamento;
    -- `day` repetido esbarraria no unique (trip_id, day_number). Nos dois casos
    -- vale a posição no array. Mesma regra de replace_trip_itinerary.
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
      -- O `and trip_id = p_trip_id` não é zelo: sem ele, um payload com o id de um
      -- dia de OUTRA viagem faria esta função escrever lá.
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

        -- ── A guarda de conflito ──
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
          -- Parada nova (ou id que não existe nesta viagem).
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
          -- A parada acabou de nascer e precisa entrar na lista de mantidas,
          -- senão a limpeza no fim apagaria o que este mesmo save inseriu.
          atividades_mantidas := atividades_mantidas || atividade_id;

        elsif base is not null and atual > base then
          -- Alguém mexeu nesta parada depois de o app ter lido. A versão do banco
          -- FICA, e o app é avisado — perder trabalho em silêncio é o que esta
          -- função existe para evitar.
          conflitos := conflitos + 1;
          atividades_mantidas := atividades_mantidas || (atividade ->> 'id')::uuid;

        else
          update public.trip_activities
             set day_id = dia_id,
                 position = ordem_atividade,
                 period = nullif(atividade ->> 'period', ''),
                 title = coalesce(nullif(atividade ->> 'title', ''), 'Parada'),
                 description = nullif(atividade ->> 'description', ''),
                 location = nullif(atividade ->> 'location', ''),
                 duration = nullif(atividade ->> 'duration', ''),
                 estimated_cost = case when jsonb_typeof(atividade -> 'estimatedCost') = 'number'
                                       then (atividade ->> 'estimatedCost')::numeric end,
                 map_query = nullif(atividade ->> 'mapQuery', ''),
                 official_url = nullif(atividade ->> 'officialUrl', ''),
                 purchase_note = nullif(atividade ->> 'purchaseNote', ''),
                 indoor = case when jsonb_typeof(atividade -> 'indoor') = 'boolean'
                               then (atividade ->> 'indoor')::boolean end,
                 latitude = case when jsonb_typeof(atividade -> 'latitude') = 'number'
                                 then (atividade ->> 'latitude')::double precision end,
                 longitude = case when jsonb_typeof(atividade -> 'longitude') = 'number'
                                  then (atividade ->> 'longitude')::double precision end,
                 category = coalesce(nullif(atividade ->> 'category', ''), 'outro')
           where id = (atividade ->> 'id')::uuid;
          atualizados := atualizados + 1;
          atividades_mantidas := atividades_mantidas || (atividade ->> 'id')::uuid;
        end if;
      end loop;
    end if;
  end loop;

  -- ── O que saiu do roteiro ──
  --
  -- A ordem importa: as atividades primeiro, para o log registrar "apagou a
  -- parada X" antes de o cascade do dia levá-las em silêncio.
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

comment on function public.sync_trip_itinerary(uuid, jsonb) is
  'Salva o roteiro por diferença, casando pelo id e recusando sobrescrever item que mudou no banco depois de o app tê-lo lido. Substitui replace_trip_itinerary, que apagava tudo e reinseria.';

-- `replace_trip_itinerary` CONTINUA EXISTINDO, e não é descuido.
--
-- O bundle web que está em produção agora chama aquela função pelo nome. Removê-la
-- nesta migração quebraria a produção no instante em que ela rodar, até o próximo
-- deploy subir. Ela sai numa migração posterior, depois de o app novo estar no ar.
comment on function public.replace_trip_itinerary(uuid, jsonb) is
  'SUPERADA por sync_trip_itinerary. Mantida apenas para o bundle já publicado, que a chama pelo nome; remover numa migração posterior ao deploy do app novo.';

commit;
