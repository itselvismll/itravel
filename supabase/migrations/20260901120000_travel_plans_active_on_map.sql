-- Roteiro aplicado no globo 3D.
--
-- So um roteiro por usuario fica plotado por vez: aplicar outro substitui o
-- anterior. Quem garante essa regra e o indice unico parcial abaixo, e nao a UI
-- -- dois dispositivos podem aplicar roteiros diferentes no mesmo instante.
--
-- Roteiros local_only (os que vivem no localStorage do dispositivo, quando o
-- salvamento remoto falha) nao passam por aqui; o client guarda o ativo deles em
-- journi.activePlanOnMap e mantem as duas origens exclusivas entre si.

begin;

alter table public.travel_plans
  add column if not exists is_active_on_map boolean not null default false;

create unique index if not exists travel_plans_one_active_on_map_idx
  on public.travel_plans (user_id)
  where is_active_on_map;

-- Troca atomica: desativa o anterior e ativa o novo na mesma transacao. Em duas
-- instrucoes separadas existiria um instante com dois roteiros ativos, e o
-- indice unico acima rejeitaria a operacao.
--
-- p_plan_id nulo = apenas remover o roteiro atual do mapa.
create or replace function public.set_active_plan_on_map(p_plan_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.travel_plans
     set is_active_on_map = false
   where user_id = auth.uid()
     and is_active_on_map
     and (p_plan_id is null or id <> p_plan_id);

  if p_plan_id is not null then
    update public.travel_plans
       set is_active_on_map = true
     where id = p_plan_id
       and user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.set_active_plan_on_map(uuid) from public;
grant execute on function public.set_active_plan_on_map(uuid) to authenticated;

commit;
