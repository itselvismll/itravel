begin;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null check (char_length(trim(email)) > 0),
  category text not null check (category in ('bug', 'duvida', 'sugestao')),
  description text not null check (char_length(trim(description)) > 0),
  status text not null default 'aberto',
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_created_at_idx
  on public.support_tickets (created_at desc);

create index if not exists support_tickets_user_id_idx
  on public.support_tickets (user_id);

alter table public.support_tickets enable row level security;

drop policy if exists "Anyone can create a support ticket" on public.support_tickets;

-- Precisa funcionar mesmo sem sessão (ex.: link "Precisa de ajuda?" na tela de
-- login), então INSERT é liberado para anon e authenticated. Um usuário logado
-- só pode gravar o próprio user_id (ou deixar nulo); um usuário anônimo (sem
-- auth.uid()) só pode gravar user_id nulo. Não há policy de SELECT/UPDATE/DELETE
-- de propósito — a leitura/gestão dos tickets é só via painel admin (service role,
-- que ignora RLS), nunca pelo app.
create policy "Anyone can create a support ticket"
  on public.support_tickets for insert
  to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

commit;
