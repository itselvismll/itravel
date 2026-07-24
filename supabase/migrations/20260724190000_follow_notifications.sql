begin;

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
    read
  )
  values (
    new.following_id,
    new.follower_id,
    'follow',
    'começou a seguir você',
    false
  );

  return new;
end;
$$;

revoke all on function public.notify_new_follower() from public;

drop trigger if exists on_follower_created_notify on public.followers;
create trigger on_follower_created_notify
after insert on public.followers
for each row
execute function public.notify_new_follower();

insert into public.notifications (
  user_id,
  actor_id,
  type,
  message,
  read
)
select
  follower.following_id,
  follower.follower_id,
  'follow',
  'começou a seguir você',
  false
from public.followers as follower
where not exists (
  select 1
  from public.notifications as notification
  where notification.user_id = follower.following_id
    and notification.actor_id = follower.follower_id
    and notification.type = 'follow'
);

commit;
