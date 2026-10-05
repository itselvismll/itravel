begin;

-- Ao excluir travel_plans, os dias e atividades são removidos por cascata.
-- Seus triggers de auditoria ainda chamam log_trip_edit, mas nesse instante a
-- viagem pai já não existe e uma nova linha no log violaria a FK. Ignoramos
-- somente esse caminho; exclusões de itens de uma viagem viva continuam no log.
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

  select coalesce(nullif(trim(title), ''), 'uma viagem') into nome_viagem
    from public.travel_plans
   where id = p_trip_id;

  -- Na cascata de DELETE da própria viagem, não há mais pai para o histórico.
  if not found then return; end if;

  insert into public.trip_edit_log (trip_id, actor_id, area, action, item_id, item_label)
  values (p_trip_id, quem, p_area, p_action, p_item_id, p_item_label);

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
  'Registra edições de uma viagem existente e ignora os deletes em cascata quando a própria viagem já foi removida.';

commit;
