begin;

-- A exclusão de uma viagem remove os participantes por ON DELETE CASCADE.
-- Nesse caminho a viagem pai já não existe; portanto, a remoção do último
-- owner é parte da exclusão da própria viagem, não uma tentativa de deixá-la
-- órfã. A trava continua valendo para DELETE/UPDATE direto em trip_members.
create or replace function public.prevent_last_trip_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
begin
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  -- O FK de trip_members para travel_plans usa ON DELETE CASCADE. Durante essa
  -- cascata, a linha pai já não está visível. Liberar somente esse caso permite
  -- excluir a viagem sem permitir que o último owner abandone uma viagem viva.
  if tg_op = 'DELETE' and not exists (
    select 1
      from public.travel_plans
     where id = old.trip_id
  ) then
    return old;
  end if;

  select count(*) into remaining
    from public.trip_members
   where trip_id = old.trip_id
     and role = 'owner'
     and status = 'accepted'
     and user_id <> old.user_id;

  if remaining = 0 then
    raise exception 'A viagem ficaria sem dono. Transfira a propriedade antes de sair, ou exclua a viagem.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

comment on function public.prevent_last_trip_owner_removal() is
  'Impede remover o último dono de uma viagem existente, mas permite a cascata ao excluir a própria viagem.';

commit;
