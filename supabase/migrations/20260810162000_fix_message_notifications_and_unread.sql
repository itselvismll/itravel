begin;

-- A tabela foi criada antes dos tipos de conversa e passaporte. Os gatilhos
-- novos usam esses tipos, portanto a restricao precisa evoluir junto deles.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow', 'comment', 'like', 'message', 'passport'));

alter table public.messages
  add column if not exists read_at timestamptz;

create index if not exists messages_unread_recipient_idx
  on public.messages (conversation_id, created_at desc)
  where read_at is null;

create or replace function public.get_unread_message_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.messages as message
  where message.sender_id <> auth.uid()
    and message.read_at is null
    and public.is_conversation_participant(message.conversation_id);
$$;

revoke all on function public.get_unread_message_count() from public;
grant execute on function public.get_unread_message_count() to authenticated;

create or replace function public.mark_conversation_read(conversation_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_participant(conversation_uuid) then
    raise exception 'Conversa nao autorizada';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = conversation_uuid
    and sender_id <> auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

commit;
