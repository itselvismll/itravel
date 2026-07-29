begin;

-- Older projects may not have received the optional caption field used by the
-- current upload form.
alter table public.country_photos
  add column if not exists caption text;

-- Match the notification target type to country_photos.id without assuming
-- whether the original project used uuid, bigint, or another identifier type.
do $$
declare
  photo_id_sql_type text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'photo_id'
  ) then
    select format_type(attribute.atttypid, attribute.atttypmod)
      into photo_id_sql_type
    from pg_attribute as attribute
    where attribute.attrelid = 'public.country_photos'::regclass
      and attribute.attname = 'id'
      and not attribute.attisdropped;

    execute format(
      'alter table public.notifications add column photo_id %s',
      photo_id_sql_type
    );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_photo_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_photo_id_fkey
      foreign key (photo_id)
      references public.country_photos (id)
      on delete set null;
  end if;
end;
$$;

create index if not exists notifications_photo_id_idx
  on public.notifications (photo_id)
  where photo_id is not null;

-- Existing installations may already have a comment notification trigger.
-- This deferred trigger attaches the photo to that notification; if none was
-- created, it creates one itself without producing duplicates.
create or replace function public.attach_comment_notification_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_owner_id uuid;
begin
  select photo.user_id
    into photo_owner_id
  from public.country_photos as photo
  where photo.id = new.photo_id;

  if photo_owner_id is null or photo_owner_id = new.user_id then
    return new;
  end if;

  update public.notifications
  set photo_id = new.photo_id
  where id = (
    select notification.id
    from public.notifications as notification
    where notification.user_id = photo_owner_id
      and notification.actor_id = new.user_id
      and notification.type = 'comment'
      and notification.photo_id is null
      and notification.created_at >= new.created_at - interval '2 minutes'
      and notification.created_at <= new.created_at + interval '2 minutes'
    order by notification.created_at desc
    limit 1
  );

  if not found then
    insert into public.notifications (
      user_id,
      actor_id,
      type,
      message,
      read,
      photo_id
    )
    values (
      photo_owner_id,
      new.user_id,
      'comment',
      'comentou sua foto',
      false,
      new.photo_id
    );
  end if;

  return new;
end;
$$;

revoke all on function public.attach_comment_notification_target() from public;

drop trigger if exists zz_attach_comment_notification_target on public.comments;
create constraint trigger zz_attach_comment_notification_target
  after insert on public.comments
  deferrable initially deferred
  for each row
  execute function public.attach_comment_notification_target();

-- Recover the target of recent/legacy notifications when timestamps identify
-- one unambiguous comment by the same actor on the recipient's photo.
update public.notifications as notification
set photo_id = (
  select comment.photo_id
  from public.comments as comment
  join public.country_photos as photo
    on photo.id = comment.photo_id
  where comment.user_id = notification.actor_id
    and photo.user_id = notification.user_id
    and abs(extract(epoch from (comment.created_at - notification.created_at))) <= 120
  order by abs(extract(epoch from (comment.created_at - notification.created_at)))
  limit 1
)
where notification.type = 'comment'
  and notification.photo_id is null;

-- Google sends the profile image as either avatar_url or picture. Keep that
-- image in profiles so avatars also appear in notifications and comments.
create or replace function public.sync_auth_profile_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set avatar_url = coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
  )
  where id = new.id
    and avatar_url is null
    and coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'picture'), '')
    ) is not null;

  return new;
end;
$$;

revoke all on function public.sync_auth_profile_avatar() from public;

drop trigger if exists zz_sync_auth_profile_avatar on auth.users;
create trigger zz_sync_auth_profile_avatar
  after insert or update of raw_user_meta_data on auth.users
  for each row
  execute function public.sync_auth_profile_avatar();

update public.profiles as profile
set avatar_url = coalesce(
  nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
  nullif(trim(auth_user.raw_user_meta_data ->> 'picture'), '')
)
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.avatar_url is null
  and coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'picture'), '')
  ) is not null;

commit;
