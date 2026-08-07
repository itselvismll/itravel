-- Notificações push in-app: campos de deep link + Realtime.
--
-- `target_id` é text de propósito: guarda o id de destino de qualquer tipo (perfil,
-- foto, conversa, passaporte) sem exigir FK para tabelas que ainda não existem (DMs e
-- passaportes). Quando esses schemas chegarem, dá para trocar por colunas tipadas.

begin;

alter table public.notifications
  add column if not exists target_id text,
  add column if not exists preview text;

comment on column public.notifications.target_id is
  'Id do destino do deep link, conforme o type: follow=profiles.id, comment=country_photos.id, message=conversation_id, passport=passport_id.';
comment on column public.notifications.preview is
  'Subtítulo do banner (ex.: trecho da mensagem). Opcional.';

-- Consulta do sino de não-lidas (ProfileScreen) e da tela de Notificações.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ── Backfill do target_id nas notificações que já existem ────────────────────
update public.notifications
set target_id = actor_id::text
where type = 'follow'
  and target_id is null
  and actor_id is not null;

update public.notifications
set target_id = photo_id::text
where type = 'comment'
  and target_id is null
  and photo_id is not null;

-- ── Triggers existentes passam a preencher target_id ────────────────────────
create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id,
    actor_id,
    type,
    message,
    read,
    target_id
  )
  values (
    new.following_id,
    new.follower_id,
    'follow',
    'começou a seguir você',
    false,
    new.follower_id::text
  );

  return new;
end;
$$;

revoke all on function public.notify_new_follower() from public;

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
  set photo_id = new.photo_id,
      target_id = new.photo_id::text
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
      photo_id,
      target_id
    )
    values (
      photo_owner_id,
      new.user_id,
      'comment',
      'comentou sua foto',
      false,
      new.photo_id,
      new.photo_id::text
    );
  end if;

  return new;
end;
$$;

revoke all on function public.attach_comment_notification_target() from public;

-- ── Realtime ────────────────────────────────────────────────────────────────
-- Sem isto o cliente assina o canal e nunca recebe nada — a falha mais silenciosa
-- possível. O `add table` dá erro se a tabela já for membro, daí a checagem.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
