-- Correção de dois defeitos da 20260911140000, achados na verificação pós-apply.
--
-- DEFEITO 1 — AS FUNÇÕES DE PURGE FICARAM CHAMÁVEIS PELA CHAVE ANÔNIMA
--
-- A migração anterior fez `revoke all ... from public` + `grant ... to
-- service_role`, o que parecia bastar. Não bastou: o Supabase mantém
--
--   alter default privileges in schema public
--     grant all on functions to postgres, anon, authenticated, service_role;
--
-- então toda função criada em `public` nasce com EXECUTE concedido a `anon` e
-- `authenticated` DIRETAMENTE. `revoke from public` não remove concessão
-- explícita de papel — só a do pseudo-papel PUBLIC.
--
-- Verificado na API de produção com a chave anônima:
--   POST /rest/v1/rpc/purge_expired_accounts -> 200 {"purged": 0, "accounts": []}
--   POST /rest/v1/rpc/purge_account          -> executou (parou no defeito 2)
--
-- Ou seja: qualquer pessoa com a chave anônima — que é pública por natureza,
-- está no bundle do app — podia disparar a limpeza de contas.
--
-- DEFEITO 2 — A VARREDURA DEFENSIVA ACUSAVA TODAS AS TABELAS
--
-- `conrelid::regclass::text` devolve o nome QUALIFICADO ('public.comments')
-- quando o `search_path` está vazio — e o `set search_path = ''` das funções,
-- que existe por segurança, é justamente o que causa isso. A lista de exceções
-- tinha nomes sem schema ('comments'), então nada casava e toda tabela era
-- reportada como não prevista.
--
-- Efeito: `purge_account` abortava SEMPRE, para qualquer conta.
--
-- COMO OS DOIS INTERAGEM, E POR QUE NÃO HOUVE PERDA DE DADOS
--
-- O defeito 2 tornou o defeito 1 inofensivo: a função era chamável, mas sempre
-- abortava antes de apagar qualquer coisa. Nenhuma conta foi excluída
-- indevidamente. Mas é exatamente por isso que os dois têm de ser corrigidos
-- JUNTOS: consertar só a varredura transformaria um buraco inerte num buraco
-- explorável.
begin;

-- ---------------------------------------------------------------------------
-- 1. Fechar o acesso de anon e authenticated
-- ---------------------------------------------------------------------------
--
-- Explícito por papel, e não só `from public`. O `service_role` continua com
-- EXECUTE: é a Edge Function quem chama.

revoke all on function public.purge_account(uuid)      from anon, authenticated;
revoke all on function public.purge_expired_accounts() from anon, authenticated;

-- As duas de baixo já se defendem sozinhas (checam `auth.uid() is null` logo na
-- entrada), mas anon não tem o que fazer com elas — fechar evita que a única
-- proteção seja uma linha no corpo da função.
revoke all on function public.request_account_deletion() from anon;
revoke all on function public.cancel_account_deletion()  from anon;

-- ---------------------------------------------------------------------------
-- 2. Varredura defensiva que compara nomes comparáveis
-- ---------------------------------------------------------------------------
--
-- Passa a ler `relname` de pg_class, que é o nome SEM schema, e restringe a
-- busca ao schema `public` por `relnamespace`. Assim os dois lados da comparação
-- falam a mesma língua, independentemente do search_path.
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
      'conversation_participants', 'messages', 'passport_shares'
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

  delete from public.profiles where id = target;
  delete from auth.users where id = target;

  return jsonb_build_object(
    'user_id', target,
    'avatar_url', avatar,
    'photo_paths', to_jsonb(fotos)
  );
end;
$$;

-- O `create or replace` acima reaplica os default privileges do Supabase, então
-- o revoke precisa vir DEPOIS — senão a função volta aberta para anon.
revoke all on function public.purge_account(uuid) from public, anon, authenticated;
grant execute on function public.purge_account(uuid) to service_role;

commit;
