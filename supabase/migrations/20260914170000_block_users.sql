-- Bloqueio de usuário: requisito de loja (Apple 1.2 / Google Play UGC).
--
-- ⚠️ PARTE 1 de 2. Aqui só existe backend: tabela, RPCs e policies. As telas e o
-- filtro explícito das leituras que o RLS não alcança vêm na parte 2.
--
-- A REGRA
--
-- O bloqueio é MÚTUO e não tem lado: se A bloqueia B, A não vê B e B não vê A.
-- Quem bloqueia é dono da linha (`blocker_id`), mas o EFEITO é simétrico — essa
-- distinção é o que explica quase todas as decisões deste arquivo.
--
-- POR QUE O FILTRO VIVE NO BANCO, E NÃO NO CLIENTE
--
-- Filtrar no cliente significa que os dados do bloqueado CHEGARAM ao aparelho e
-- só não foram desenhados. Basta um caminho de leitura esquecido — e há nove
-- superfícies — para o conteúdo vazar. As policies abaixo cortam na origem: nem
-- com a chave anônima na mão, nem com uma query escrita à mão, o conteúdo de
-- quem bloqueou aparece.
begin;

-- ---------------------------------------------------------------------------
-- 1. A tabela
-- ---------------------------------------------------------------------------

create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  -- Bloquear a si mesmo esconderia a pessoa do próprio app. Barrado no schema, e
  -- não só na RPC, porque a tabela também é escrita direto pelo PostgREST.
  constraint blocked_users_sem_auto_bloqueio check (blocker_id <> blocked_id)
);

comment on table public.blocked_users is
  'Bloqueios entre usuários. A linha tem dono (blocker_id), mas o efeito é mútuo: ver public.is_blocked_either_way.';

-- A PK já cobre a busca no sentido "eu bloqueei fulano". Este índice cobre o
-- sentido inverso, "fulano me bloqueou", que é metade de toda checagem mútua e
-- sem ele viria de varredura sequencial.
create index if not exists blocked_users_blocked_idx
  on public.blocked_users (blocked_id, blocker_id);

alter table public.blocked_users enable row level security;

-- Só o dono lê e escreve as PRÓPRIAS linhas. Ninguém consegue perguntar ao
-- PostgREST "quem me bloqueou?" — essa lista não é dele. É por isso que a
-- checagem mútua precisa ser `security definer` (seção 2).
drop policy if exists blocked_users_select on public.blocked_users;
create policy blocked_users_select on public.blocked_users
  for select to authenticated
  using (blocker_id = auth.uid());

drop policy if exists blocked_users_insert on public.blocked_users;
create policy blocked_users_insert on public.blocked_users
  for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists blocked_users_delete on public.blocked_users;
create policy blocked_users_delete on public.blocked_users
  for delete to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. As checagens, usadas pelas policies
-- ---------------------------------------------------------------------------
--
-- `security definer` NÃO é opcional: a policy da seção 1 mostra a cada um apenas
-- os bloqueios que ELE fez. Sem o definer, "fulano me bloqueou" seria invisível
-- para mim e o bloqueio deixaria de ser mútuo — exatamente o buraco que esta
-- função existe para fechar.
--
-- `stable` deixa o planejador reaproveitar o resultado dentro da mesma consulta,
-- o que importa: isto roda por LINHA num feed.
create or replace function public.is_blocked_either_way(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Sem os dois lados não há par a comparar. Devolver false (em vez de null)
    -- mantém as policies legíveis: elas usam `not is_blocked_either_way(...)` e
    -- um null ali reprovaria a linha em silêncio.
    when user_a is null or user_b is null then false
    else exists (
      select 1
      from public.blocked_users b
      where (b.blocker_id = user_a and b.blocked_id = user_b)
         or (b.blocker_id = user_b and b.blocked_id = user_a)
    )
  end;
$$;

revoke all on function public.is_blocked_either_way(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_either_way(uuid, uuid) to authenticated;

-- Dono de uma foto, sem passar pela RLS de `country_photos`.
--
-- Existe por um motivo específico: a policy de INSERT de comentário precisa saber
-- de quem é a foto, e uma subconsulta comum a `country_photos` obedeceria à
-- policy de leitura — que, justamente, JÁ esconde a foto de quem bloqueou. O
-- resultado seria "não achei a foto, logo não há bloqueio, pode comentar": o
-- contrário do pretendido.
create or replace function public.photo_author(photo uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id from public.country_photos p where p.id = photo;
$$;

revoke all on function public.photo_author(uuid) from public, anon;
grant execute on function public.photo_author(uuid) to authenticated;

-- Existe bloqueio entre quem está pedindo e algum OUTRO participante da conversa?
--
-- Definer pelo mesmo motivo: `conversation_participants` tem RLS, e a policy de
-- mensagens precisa enxergar o participante do outro lado para decidir.
--
-- "Algum outro participante" e não "o outro": as conversas hoje são todas 1:1
-- (conferido no banco), mas no dia em que existir grupo a leitura correta é a
-- conservadora — havendo bloqueio com qualquer participante, a conversa some.
create or replace function public.conversation_has_block(conversation_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversation_uuid
      and cp.user_id <> auth.uid()
      and public.is_blocked_either_way(auth.uid(), cp.user_id)
  );
$$;

revoke all on function public.conversation_has_block(uuid) from public, anon;
grant execute on function public.conversation_has_block(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bloquear e desbloquear
-- ---------------------------------------------------------------------------

create or replace function public.block_user(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserido boolean;
begin
  if auth.uid() is null then
    raise exception 'block_user: sem usuário autenticado';
  end if;
  if target_id is null then
    raise exception 'block_user: uuid nulo';
  end if;
  if target_id = auth.uid() then
    raise exception 'block_user: não é possível bloquear a si mesmo';
  end if;

  -- `on conflict do nothing` deixa a chamada idempotente: tocar no botão duas
  -- vezes não é erro, e a tela não precisa saber se já havia bloqueio.
  insert into public.blocked_users (blocker_id, blocked_id)
  values (auth.uid(), target_id)
  on conflict do nothing
  returning true into inserido;

  -- Desfaz o "seguir" NOS DOIS SENTIDOS. Deixar a relação de pé manteria os dois
  -- somando no contador de seguidores um do outro, e eles reapareceriam um para
  -- o outro no instante em que o bloqueio fosse desfeito.
  delete from public.followers
   where (follower_id = auth.uid() and following_id = target_id)
      or (follower_id = target_id and following_id = auth.uid());

  return coalesce(inserido, false);
end;
$$;

revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removido boolean;
begin
  if auth.uid() is null then
    raise exception 'unblock_user: sem usuário autenticado';
  end if;
  if target_id is null then
    raise exception 'unblock_user: uuid nulo';
  end if;

  -- Só o próprio bloqueio é desfeito: `blocker_id = auth.uid()`. Se B também
  -- bloqueou A, o bloqueio de B continua de pé — cada um desfaz o seu.
  delete from public.blocked_users
   where blocker_id = auth.uid()
     and blocked_id = target_id
  returning true into removido;

  -- O "seguir" apagado no bloqueio NÃO volta: refazer a relação por conta
  -- própria seria o app decidindo que as duas pessoas voltam a se seguir.
  return coalesce(removido, false);
end;
$$;

revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. As policies que passam a enxergar o bloqueio
-- ---------------------------------------------------------------------------
--
-- Toda policy abaixo mantém `... = auth.uid()` como primeira alternativa, pelo
-- mesmo motivo das policies de exclusão de conta: o bloqueio esconde o OUTRO,
-- nunca o próprio conteúdo de quem está olhando.

-- 4.1 Perfil. É a policy mais valiosa da lista: busca de viajantes, sugestões,
--     perfil público e todo join que traz `profiles` passam por aqui.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (public.is_account_active(id) and not public.is_blocked_either_way(auth.uid(), id))
  );

-- 4.2 Fotos: feed, explorar e grade do perfil.
drop policy if exists country_photos_select on public.country_photos;
create policy country_photos_select on public.country_photos
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      is_public = true
      and public.is_account_active(user_id)
      and not public.is_blocked_either_way(auth.uid(), user_id)
    )
  );

-- 4.3 Comentários: os do bloqueado somem da foto.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_account_active(user_id)
      and not public.is_blocked_either_way(auth.uid(), user_id)
    )
  );

-- 4.4 Comentar na foto de quem bloqueou: barrado na escrita, não só na tela.
--     `photo_author` é definer justamente para não cair no vazio descrito na
--     seção 2 — sem ele, a foto escondida pareceria "sem dono" e liberaria.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_blocked_either_way(auth.uid(), public.photo_author(photo_id))
  );

-- 4.5 Seguir: bloqueado não segue, e não é seguido.
drop policy if exists followers_insert on public.followers;
create policy followers_insert on public.followers
  for insert to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> following_id
    and not public.is_blocked_either_way(auth.uid(), following_id)
  );

-- 4.6 As listas de seguidores e seguindo, dos dois lados da relação.
drop policy if exists followers_select on public.followers;
create policy followers_select on public.followers
  for select to authenticated
  using (
    (
      follower_id = auth.uid()
      or (public.is_account_active(follower_id) and not public.is_blocked_either_way(auth.uid(), follower_id))
    )
    and (
      following_id = auth.uid()
      or (public.is_account_active(following_id) and not public.is_blocked_either_way(auth.uid(), following_id))
    )
  );

-- 4.7 Notificações: o vazamento aqui é o ATOR — "Fulano curtiu sua foto" com o
--     nome de quem foi bloqueado.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    and (
      actor_id is null
      or actor_id = auth.uid()
      or (
        public.is_account_active(actor_id)
        and not public.is_blocked_either_way(auth.uid(), actor_id)
      )
    )
  );

-- 4.8 DMs: a conversa inteira some enquanto o bloqueio durar — some da lista,
--     some ao abrir, e não aceita mensagem nova. O histórico NÃO é apagado:
--     desfeito o bloqueio, a conversa volta como estava. Apagar seria uma perda
--     definitiva a partir de uma ação reversível.
drop policy if exists "Participants read conversations" on public.conversations;
create policy "Participants read conversations" on public.conversations
  for select to authenticated
  using (
    public.is_conversation_participant(id)
    and not public.conversation_has_block(id)
  );

drop policy if exists "Participants read participants" on public.conversation_participants;
create policy "Participants read participants" on public.conversation_participants
  for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and not public.conversation_has_block(conversation_id)
  );

drop policy if exists "Participants read messages" on public.messages;
create policy "Participants read messages" on public.messages
  for select to authenticated
  using (
    public.is_conversation_participant(conversation_id)
    and not public.conversation_has_block(conversation_id)
  );

drop policy if exists "Participants send messages" on public.messages;
create policy "Participants send messages" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and not public.conversation_has_block(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- 5. A exclusão de conta precisa saber desta tabela
-- ---------------------------------------------------------------------------
--
-- `purge_account` aborta de propósito quando encontra uma tabela com FK para
-- auth.users que não está na sua lista (ver 20260911160000). `blocked_users` tem
-- duas dessas FKs: sem esta seção, a varredura passaria a acusar a tabela nova e
-- NENHUMA conta seria excluída — a limpeza diária quebraria inteira.
--
-- O `delete` cobre as duas colunas: quem a pessoa bloqueou e quem a bloqueou.
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
      'blocked_users'
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

-- O `create or replace` reaplica os default privileges do Supabase, então o
-- revoke vem DEPOIS — senão a função volta aberta para anon (ver 20260911160000).
revoke all on function public.purge_account(uuid) from public, anon, authenticated;
grant execute on function public.purge_account(uuid) to service_role;

commit;
