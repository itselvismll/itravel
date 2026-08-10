begin;

create table if not exists public.passport_shares (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

create index if not exists passport_shares_recipient_created_idx
  on public.passport_shares (recipient_id, created_at desc);

alter table public.passport_shares enable row level security;

drop policy if exists "Users read sent or received passports" on public.passport_shares;
create policy "Users read sent or received passports" on public.passport_shares
for select to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "Users share their own passport" on public.passport_shares;
create policy "Users share their own passport" on public.passport_shares
for insert to authenticated
with check (sender_id = auth.uid() and recipient_id <> auth.uid());

alter table public.messages
  add column if not exists shared_passport_id uuid references public.passport_shares(id) on delete set null,
  add column if not exists shared_passport jsonb;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.messages'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%shared_plan%'
  loop
    execute format('alter table public.messages drop constraint %I', constraint_record.conname);
  end loop;
end;
$$;

alter table public.messages
  add constraint messages_content_check
  check (
    char_length(trim(coalesce(body, ''))) > 0
    or shared_photo is not null
    or shared_plan is not null
    or shared_passport is not null
  );

alter table public.notifications
  add column if not exists conversation_id uuid,
  add column if not exists passport_share_id uuid,
  add column if not exists preview text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_conversation_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_conversation_id_fkey
      foreign key (conversation_id) references public.conversations(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_passport_share_id_fkey'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_passport_share_id_fkey
      foreign key (passport_share_id) references public.passport_shares(id) on delete cascade;
  end if;
end;
$$;

create index if not exists notifications_conversation_idx
  on public.notifications (conversation_id) where conversation_id is not null;
create index if not exists notifications_passport_share_idx
  on public.notifications (passport_share_id) where passport_share_id is not null;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient record;
  message_preview text;
begin
  message_preview := left(
    coalesce(
      nullif(trim(new.body), ''),
      case
        when new.shared_photo is not null then 'Compartilhou uma publicação'
        when new.shared_plan is not null then 'Compartilhou um roteiro'
        else 'Enviou uma mensagem'
      end
    ),
    120
  );

  for recipient in
    select participant.user_id
    from public.conversation_participants participant
    where participant.conversation_id = new.conversation_id
      and participant.user_id <> new.sender_id
  loop
    insert into public.notifications (
      user_id, actor_id, type, message, preview, read, conversation_id
    ) values (
      recipient.user_id,
      new.sender_id,
      'message',
      'enviou uma mensagem',
      message_preview,
      false,
      new.conversation_id
    );
  end loop;

  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

revoke all on function public.notify_new_message() from public;
drop trigger if exists on_message_created_notify on public.messages;
create trigger on_message_created_notify
after insert on public.messages
for each row
when (new.shared_passport_id is null)
execute function public.notify_new_message();

create or replace function public.notify_received_passport()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    user_id, actor_id, type, message, preview, read, passport_share_id
  ) values (
    new.recipient_id,
    new.sender_id,
    'passport',
    'compartilhou um passaporte com você',
    'Abra para ver os países visitados e os próximos destinos',
    false,
    new.id
  );
  return new;
end;
$$;

revoke all on function public.notify_received_passport() from public;
drop trigger if exists on_passport_shared_notify on public.passport_shares;
create trigger on_passport_shared_notify
after insert on public.passport_shares
for each row execute function public.notify_received_passport();

-- A migração do banner global também redefine esta função. Esta versão final
-- mantém o deep link novo sem reintroduzir notificações duplicadas.
create or replace function public.notify_new_follower()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where user_id = new.following_id
    and actor_id = new.follower_id
    and type = 'follow';

  insert into public.notifications (
    user_id, actor_id, type, message, read, target_id
  ) values (
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

commit;
