-- Denúncia de conteúdo: requisito de loja (Apple 1.2 / Google Play UGC), par do
-- bloqueio da 20260914170000.
--
-- BLOQUEIO E DENÚNCIA RESOLVEM COISAS DIFERENTES
--
-- Bloquear é uma decisão privada e imediata: some da minha frente. Denunciar é
-- um pedido de revisão HUMANA, que não muda nada na tela de quem denuncia. Por
-- isso a denúncia não esconde nada e não tem efeito automático: ela só grava o
-- sinal. Quem quiser as duas coisas bloqueia E denuncia.
--
-- MODERAÇÃO É MANUAL, POR ENQUANTO
--
-- Não existe papel de moderador no banco nem tela de moderação: o atendimento é
-- feito direto no Dashboard, com service_role — mesmo caminho de
-- `support_tickets`. É por isso que NÃO existe policy de leitura ampla aqui: se
-- existisse, seria uma lista de "quem denunciou quem" legível pelo app.
begin;

-- ---------------------------------------------------------------------------
-- 1. A tabela
-- ---------------------------------------------------------------------------

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),

  -- Anulável, com `on delete set null`, igual a `support_tickets`: se quem
  -- denunciou excluir a conta, a denúncia CONTINUA — ela é sobre o conteúdo de
  -- outra pessoa, e apagá-la junto destruiria o sinal de moderação sobre alguém
  -- que não tem nada a ver com aquela exclusão.
  reporter_id uuid references auth.users (id) on delete set null,

  -- `text` com CHECK, e não um tipo enum do Postgres: acrescentar um valor a um
  -- enum exige ALTER TYPE e trava a tabela; aqui é só trocar a restrição.
  target_type text not null check (target_type in ('photo', 'comment', 'profile', 'message')),

  -- Sem FK de propósito: o alvo vive em quatro tabelas diferentes, e uma FK só
  -- pode apontar para uma. Mais importante — se o conteúdo denunciado for
  -- apagado (pelo autor ou pela própria moderação), a denúncia precisa
  -- sobreviver para o histórico fazer sentido. Uma FK com cascade apagaria
  -- justamente o registro do problema.
  target_id uuid not null,

  reason text not null check (length(trim(reason)) > 0),
  details text,

  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),

  created_at timestamptz not null default now()
);

comment on table public.reports is
  'Denúncias de conteúdo. Moderação é manual, via Dashboard com service_role: não há policy de leitura ampla.';

-- Fila de moderação: "o que está pendente, mais antigo primeiro". Parcial porque
-- resolvido e descartado saem da fila e não precisam custar escrita no índice.
create index if not exists reports_fila_idx
  on public.reports (created_at)
  where status = 'pending';

-- "Quantas denúncias este conteúdo já tem?" — a pergunta que transforma várias
-- denúncias iguais no sinal que elas são.
create index if not exists reports_alvo_idx
  on public.reports (target_type, target_id);

alter table public.reports enable row level security;

-- Só as próprias denúncias, e só leitura. Sem policy de INSERT: quem grava é a
-- RPC da seção 2, que é `security definer` e valida antes. Sem UPDATE nem
-- DELETE: denúncia não se edita nem se apaga pelo app — `status` é da moderação.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Criar denúncia
-- ---------------------------------------------------------------------------
--
-- NÃO é idempotente, de propósito: a mesma pessoa denunciando o mesmo conteúdo
-- duas vezes é sinal, não duplicidade. Quem modera quer ver o volume.
create or replace function public.create_report(
  target_type text,
  target_id uuid,
  reason text,
  details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo_id uuid;
  motivo text := trim(coalesce(reason, ''));
  detalhes text := nullif(trim(coalesce(details, '')), '');
begin
  if auth.uid() is null then
    raise exception 'create_report: sem usuário autenticado';
  end if;
  if target_id is null then
    raise exception 'create_report: alvo nulo';
  end if;
  if target_type is null or target_type not in ('photo', 'comment', 'profile', 'message') then
    raise exception 'create_report: tipo de alvo inválido (%)', target_type;
  end if;
  if motivo = '' then
    raise exception 'create_report: motivo vazio';
  end if;

  -- Denunciar a si mesmo não é sinal de nada e só sujaria a fila.
  if target_type = 'profile' and target_id = auth.uid() then
    raise exception 'create_report: não é possível denunciar o próprio perfil';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (auth.uid(), target_type, target_id, motivo, detalhes)
  returning id into novo_id;

  return novo_id;
end;
$$;

revoke all on function public.create_report(text, uuid, text, text) from public, anon;
grant execute on function public.create_report(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A exclusão de conta precisa saber desta tabela
-- ---------------------------------------------------------------------------
--
-- `purge_account` aborta de propósito diante de uma tabela com FK para
-- auth.users que não esteja na sua lista (ver 20260911160000). Sem esta seção, a
-- tabela nova faria a limpeza diária falhar para TODA conta.
--
-- `reports` entra na lista mas NÃO ganha `delete`: o FK é `set null`, e a
-- denúncia sobrevive desvinculada — mesma decisão de `support_tickets`, e o
-- motivo está no comentário da coluna `reporter_id`.
create or replace function public.purge_account(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inesperadas text;
  avatar text;
  fotos text[];
begin
  if target is null then
    raise exception 'purge_account: uuid nulo';
  end if;

  select string_agg(distinct cl.relname, ', ')
    into inesperadas
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class cl on cl.oid = c.conrelid
  where c.contype = 'f'
    and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
    and cl.relnamespace = 'public'::regnamespace
    and cl.relname not in (
      'visited_countries', 'country_photos', 'favorite_photos', 'profiles',
      'followers', 'wishlist', 'notifications', 'comments', 'travel_plans',
      'support_tickets', 'explore_interactions', 'conversations',
      'conversation_participants', 'messages', 'passport_shares',
      'blocked_users', 'reports'
    );

  if inesperadas is not null then
    raise exception
      'purge_account: tabela com FK não prevista (%). Atualize a lista desta função antes de excluir contas.',
      inesperadas;
  end if;

  select p.avatar_url into avatar
    from public.profiles p where p.id = target;

  select coalesce(array_agg(cp.photo_path) filter (where cp.photo_path is not null), '{}')
    into fotos
    from public.country_photos cp where cp.user_id = target;

  update public.messages      set sender_id  = null where sender_id  = target;
  update public.conversations set created_by = null where created_by = target;

  delete from public.notifications where actor_id = target;

  delete from public.country_photos            where user_id = target;
  delete from public.comments                  where user_id = target;
  delete from public.favorite_photos           where user_id = target;
  delete from public.visited_countries         where user_id = target;
  delete from public.wishlist                  where user_id = target;
  delete from public.travel_plans              where user_id = target;
  delete from public.explore_interactions      where user_id = target;
  delete from public.notifications             where user_id = target;
  delete from public.followers                 where follower_id = target or following_id = target;
  delete from public.passport_shares           where sender_id = target or recipient_id = target;
  delete from public.conversation_participants where user_id = target;
  delete from public.blocked_users             where blocker_id = target or blocked_id = target;

  delete from public.profiles where id = target;
  delete from auth.users where id = target;

  return jsonb_build_object(
    'user_id', target,
    'avatar_url', avatar,
    'photo_paths', to_jsonb(fotos)
  );
end;
$$;

revoke all on function public.purge_account(uuid) from public, anon, authenticated;
grant execute on function public.purge_account(uuid) to service_role;

commit;
