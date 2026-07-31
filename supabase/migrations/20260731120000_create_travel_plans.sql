begin;

create table if not exists public.travel_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  destination text not null,
  origin text,
  start_date date,
  end_date date,
  travelers integer not null default 1 check (travelers between 1 and 30),
  budget numeric check (budget is null or budget >= 0),
  currency text not null default 'BRL' check (char_length(currency) = 3),
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  request_data jsonb not null default '{}'::jsonb,
  plan_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_plans_user_updated_idx
  on public.travel_plans (user_id, updated_at desc);

alter table public.travel_plans enable row level security;

drop policy if exists "Users read own travel plans" on public.travel_plans;
drop policy if exists "Users create own travel plans" on public.travel_plans;
drop policy if exists "Users update own travel plans" on public.travel_plans;
drop policy if exists "Users delete own travel plans" on public.travel_plans;

create policy "Users read own travel plans"
  on public.travel_plans for select to authenticated
  using (user_id = auth.uid());

create policy "Users create own travel plans"
  on public.travel_plans for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users update own travel plans"
  on public.travel_plans for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users delete own travel plans"
  on public.travel_plans for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.touch_travel_plan_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_travel_plan_updated_at on public.travel_plans;
create trigger touch_travel_plan_updated_at
  before update on public.travel_plans
  for each row execute function public.touch_travel_plan_updated_at();

commit;
