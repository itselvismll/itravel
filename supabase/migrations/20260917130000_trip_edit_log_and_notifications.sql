-- Fase 2: quem mexeu no quê, e quem fica sabendo.
--
-- Duas perguntas diferentes, e é por isso que são duas coisas:
--
--   "QUEM EDITOU ESTA PARADA?" — pergunta de tela, feita ao abrir o roteiro,
--   para toda parada visível de uma vez. Responder isso com uma consulta ao
--   histórico seria uma consulta por linha. Então a resposta mora NA LINHA:
--   `last_edited_by`, denormalizado, sempre o último.
--
--   "O QUE ANDOU MUDANDO NESTA VIAGEM?" — pergunta de histórico, feita raramente
--   e em ordem cronológica. Essa é `trip_edit_log`, append-only.
--
-- A NOTIFICAÇÃO SAI DO LOG, E É AGRUPADA POR JANELA. Salvar um roteiro de 21
-- dias mexe em dezenas de linhas; uma notificação por linha, vezes o número de
-- participantes, transformaria o sino em lixo no primeiro save. A regra: no
-- máximo um aviso de edição por (viagem, quem editou, quem recebe) a cada
-- EDIT_NOTIFICATION_WINDOW. O log continua registrando tudo — o que é agrupado é
-- o AVISO, não o histórico.
--
-- POR QUE O CHECK DE `notifications.type` MUDA AQUI: a migração
-- 20260812130000_social_notifications_only restringiu o tipo a
-- ('follow','comment','like') de propósito, tirando mensagens e passaportes, que
-- pertencem à caixa de conversas. Viagem colaborativa é caso diferente: não tem
-- caixa própria, e o convite precisa chegar em algum lugar. Os três tipos novos
-- entram, e `src/utils/socialNotifications.js` precisa listá-los também — é
-- aquela lista que marca notificação como lida, e tipo fora dela nunca é lido.

begin;

-- ── Quem editou cada item ────────────────────────────────────────────────────

alter table public.trip_days
  add column if not exists last_edited_by uuid references public.profiles (id) on delete set null;

alter table public.trip_activities
  add column if not exists last_edited_by uuid references public.profiles (id) on delete set null;

comment on column public.trip_activities.last_edited_by is
  'Último a mexer nesta parada, denormalizado para a tela mostrar "editado por X" sem uma consulta por linha. O histórico completo é trip_edit_log.';

-- `updated_at` já é mantido pelo trigger touch_trip_itinerary_updated_at (Fase 0).
-- Este marca a autoria no mesmo lugar, para não depender de o app lembrar de
-- mandar o campo — o que ele esqueceria em algum caminho de escrita.
create or replace function public.stamp_trip_itinerary_editor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.last_edited_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists stamp_trip_days_editor on public.trip_days;
create trigger stamp_trip_days_editor
  before insert or update on public.trip_days
  for each row execute function public.stamp_trip_itinerary_editor();

drop trigger if exists stamp_trip_activities_editor on public.trip_activities;
create trigger stamp_trip_activities_editor
  before insert or update on public.trip_activities
  for each row execute function public.stamp_trip_itinerary_editor();

-- ── O histórico ──────────────────────────────────────────────────────────────

create table if not exists public.trip_edit_log (
  id bigserial primary key,
  trip_id uuid not null references public.travel_plans (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,

  -- Em que parte da viagem a pessoa mexeu. 'itinerary' cobre dia e parada;
  -- checklist e orçamento ainda vivem em travel_plans.plan_data.
  area text not null check (area in ('itinerary', 'checklist', 'budget', 'trip')),
  action text not null check (action in ('created', 'updated', 'deleted')),

  -- Qual item, para a tela de histórico poder apontar. Texto e não FK: a linha
  -- de log tem de sobreviver à exclusão do item que ela descreve — é justamente
  -- o caso "Fulano apagou a parada X" que mais interessa.
  item_id text,
  item_label text,

  created_at timestamptz not null default now()
);

comment on table public.trip_edit_log is
  'Histórico append-only de edições da viagem. Sobrevive à exclusão do item descrito, por isso item_id é text e não FK.';

create index if not exists trip_edit_log_trip_idx
  on public.trip_edit_log (trip_id, created_at desc);

alter table public.trip_edit_log enable row level security;

-- Membro lê o histórico da própria viagem. Ninguém escreve pelo PostgREST: as
-- linhas nascem dos triggers abaixo, que rodam como definer.
create policy "Members read trip edit log"
  on public.trip_edit_log for select to authenticated
  using (public.is_trip_member(trip_id));

-- ── Notificações: os tipos novos ─────────────────────────────────────────────

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'follow', 'comment', 'like',
    -- Você foi convidado para uma viagem.
    'trip_invite',
    -- Alguém entrou numa viagem sua (aceitando convite ou pelo link).
    'trip_joined',
    -- Alguém editou algo da viagem. Agrupada por janela, ver notify_trip_edit.
    'trip_edit'
  ));

-- ── Convite recebido, e entrada na viagem ────────────────────────────────────

create or replace function public.notify_trip_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_viagem text;
  entrou boolean;
begin
  select coalesce(nullif(trim(title), ''), 'uma viagem') into nome_viagem
    from public.travel_plans where id = new.trip_id;

  -- Insert 'pending' = convite enviado. Insert 'accepted' = entrou pelo link.
  -- Update pending -> accepted = aceitou o convite.
  entrou := new.status = 'accepted'
        and (tg_op = 'INSERT' or old.status = 'pending');

  if tg_op = 'INSERT' and new.status = 'pending' then
    -- Quem recebe é o convidado; o ator é quem convidou.
    insert into public.notifications (user_id, actor_id, type, message, read, target_id, preview)
    values (
      new.user_id,
      new.invited_by,
      'trip_invite',
      'te convidou para uma viagem',
      false,
      new.trip_id::text,
      nome_viagem
    );
    return new;
  end if;

  if entrou then
    -- Quem recebe são os OUTROS participantes aceitos; o ator é quem entrou.
    -- Sem o `user_id <> new.user_id`, a pessoa receberia aviso da própria
    -- entrada — que é o tipo de notificação que ensina a ignorar o sino.
    insert into public.notifications (user_id, actor_id, type, message, read, target_id, preview)
    select m.user_id, new.user_id, 'trip_joined', 'entrou na sua viagem', false,
           new.trip_id::text, nome_viagem
      from public.trip_members m
     where m.trip_id = new.trip_id
       and m.status = 'accepted'
       and m.user_id <> new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists notify_trip_membership on public.trip_members;
create trigger notify_trip_membership
  after insert or update of status on public.trip_members
  for each row execute function public.notify_trip_membership();

-- ── Edição: log sempre, notificação agrupada ─────────────────────────────────

-- A janela do agrupamento. 30 minutos cobre uma sessão de edição inteira: quem
-- passa meia hora mexendo no roteiro gera UM aviso para cada participante, não
-- um por parada.
create or replace function public.trip_edit_notification_window()
returns interval
language sql
immutable
as $$ select interval '30 minutes' $$;

create or replace function public.log_trip_edit(
  p_trip_id uuid,
  p_area text,
  p_action text,
  p_item_id text,
  p_item_label text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  nome_viagem text;
  quem uuid := auth.uid();
begin
  if quem is null then return; end if;

  insert into public.trip_edit_log (trip_id, actor_id, area, action, item_id, item_label)
  values (p_trip_id, quem, p_area, p_action, p_item_id, p_item_label);

  select coalesce(nullif(trim(title), ''), 'uma viagem') into nome_viagem
    from public.travel_plans where id = p_trip_id;

  -- Um aviso por (viagem, autor, destinatário) por janela. O `not exists` é o
  -- agrupamento inteiro: se já existe aviso recente daquele autor para aquela
  -- pessoa naquela viagem, o log registra a mudança e o sino fica quieto.
  insert into public.notifications (user_id, actor_id, type, message, read, target_id, preview)
  select m.user_id, quem, 'trip_edit', 'editou a viagem', false,
         p_trip_id::text, nome_viagem
    from public.trip_members m
   where m.trip_id = p_trip_id
     and m.status = 'accepted'
     and m.user_id <> quem
     and not exists (
       select 1 from public.notifications n
        where n.user_id = m.user_id
          and n.actor_id = quem
          and n.type = 'trip_edit'
          and n.target_id = p_trip_id::text
          and n.created_at > now() - public.trip_edit_notification_window()
     );
end;
$$;

comment on function public.log_trip_edit(uuid, text, text, text, text) is
  'Registra a edição no histórico SEMPRE, e notifica os outros participantes no máximo uma vez por janela. O agrupamento é do aviso, não do histórico.';

-- Os triggers do roteiro. Chamam a função acima com o rótulo do item, para o
-- histórico dizer "Fulano editou a parada Coliseu" e não "Fulano editou algo".
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

drop trigger if exists log_trip_activity_edit on public.trip_activities;
create trigger log_trip_activity_edit
  after insert or update or delete on public.trip_activities
  for each row execute function public.log_trip_activity_edit();

create or replace function public.log_trip_day_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.log_trip_edit(
      old.trip_id, 'itinerary', 'deleted', old.id::text, 'Dia ' || old.day_number
    );
    return old;
  end if;

  -- Só UPDATE: a criação de um dia vem sempre junto das paradas dele, e logar as
  -- duas coisas encheria o histórico de "criou o Dia 3" sem informação nova.
  if tg_op = 'UPDATE' then
    perform public.log_trip_edit(
      new.trip_id, 'itinerary', 'updated', new.id::text, 'Dia ' || new.day_number
    );
  end if;
  return new;
end;
$$;

drop trigger if exists log_trip_day_edit on public.trip_days;
create trigger log_trip_day_edit
  after update or delete on public.trip_days
  for each row execute function public.log_trip_day_edit();

-- Checklist e orçamento continuam dentro de travel_plans.plan_data, então o que
-- detecta a mudança deles é a comparação do jsonb. Enquanto não forem
-- normalizados, é o melhor que dá para saber — e é honesto: diz a ÁREA que
-- mudou, sem fingir saber qual item.
create or replace function public.log_trip_plan_data_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;

  if (old.plan_data -> 'checklist') is distinct from (new.plan_data -> 'checklist') then
    perform public.log_trip_edit(new.id, 'checklist', 'updated', null, null);
  end if;

  if (old.plan_data -> 'budget') is distinct from (new.plan_data -> 'budget')
     or old.budget is distinct from new.budget then
    perform public.log_trip_edit(new.id, 'budget', 'updated', null, null);
  end if;

  return new;
end;
$$;

drop trigger if exists log_trip_plan_data_edit on public.travel_plans;
create trigger log_trip_plan_data_edit
  after update on public.travel_plans
  for each row execute function public.log_trip_plan_data_edit();

revoke all on function public.log_trip_edit(uuid, text, text, text, text) from public, anon;
grant execute on function public.log_trip_edit(uuid, text, text, text, text) to authenticated;
grant execute on function public.trip_edit_notification_window() to authenticated;

commit;
