begin;

-- Mensagens e passaportes compartilhados pertencem exclusivamente à caixa de
-- conversas. O contador de mensagens continua vindo de messages.read_at.
drop trigger if exists on_message_created_notify on public.messages;
drop trigger if exists on_passport_shared_notify on public.passport_shares;
drop function if exists public.notify_new_message();
drop function if exists public.notify_received_passport();

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_conversation_from_message() from public;
drop trigger if exists on_message_created_touch_conversation on public.messages;
create trigger on_message_created_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_from_message();

delete from public.notifications where type in ('message', 'passport');

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('follow', 'comment', 'like'));

-- O coração do feed usa favorite_photos como relação persistente. Cada
-- inclusão gera uma curtida para o autor da foto; remover o coração também
-- remove a notificação correspondente.
create or replace function public.sync_photo_like_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_owner_id uuid;
  target_photo_id public.favorite_photos.photo_id%type;
  actor_user_id uuid;
begin
  target_photo_id := coalesce(new.photo_id, old.photo_id);
  actor_user_id := coalesce(new.user_id, old.user_id);

  select photo.user_id
    into photo_owner_id
  from public.country_photos as photo
  where photo.id = target_photo_id;

  if photo_owner_id is null or photo_owner_id = actor_user_id then
    return coalesce(new, old);
  end if;

  delete from public.notifications
  where user_id = photo_owner_id
    and actor_id = actor_user_id
    and type = 'like'
    and photo_id = target_photo_id;

  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, type, message, read, photo_id)
    values (photo_owner_id, actor_user_id, 'like', 'curtiu sua foto', false, target_photo_id);
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_photo_like_notification() from public;
drop trigger if exists on_favorite_photo_sync_like_notification on public.favorite_photos;
create trigger on_favorite_photo_sync_like_notification
after insert or delete on public.favorite_photos
for each row execute function public.sync_photo_like_notification();

commit;
