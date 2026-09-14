-- Verificação do bloqueio, inteira dentro de uma transação que termina em
-- ROLLBACK: roda contra o banco de produção sem deixar usuário, foto ou
-- conversa de teste para trás.
begin;

create temporary table resultado (
  ordem serial,
  teste text,
  esperado text,
  obtido text
) on commit drop;

grant all on resultado to authenticated;
grant usage, select on sequence resultado_ordem_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Cenário: A e B, uma foto pública de A, uma conversa entre os dois.
-- ---------------------------------------------------------------------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bloqueio-teste-a@exemplo.invalido', 'x',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{"username":"testeblocka"}'::jsonb),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bloqueio-teste-b@exemplo.invalido', 'x',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{"username":"testeblockb"}'::jsonb);

-- O trigger de cadastro pode ou não ter criado os perfis; garante os dois.
insert into public.profiles (id, username)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'testeblocka'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'testeblockb')
on conflict (id) do nothing;

insert into public.country_photos (id, user_id, country_code, country_name, photo_url, photo_path, is_public)
values ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001',
        'BRA', 'Brasil', 'https://exemplo.invalido/f.jpg', 'teste/f.jpg', true);

insert into public.conversations (id, created_by)
values ('dddddddd-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.conversation_participants (conversation_id, user_id)
values ('dddddddd-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001'),
       ('dddddddd-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002');

insert into public.messages (id, conversation_id, sender_id, body)
values ('eeeeeeee-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000004',
        'aaaaaaaa-0000-4000-8000-000000000001', 'oi');

-- A segue B e B segue A, para provar que o bloqueio desfaz os dois sentidos.
insert into public.followers (follower_id, following_id)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002'),
       ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- ANTES do bloqueio, como B: o conteúdo de A tem de estar visível.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into resultado (teste, esperado, obtido)
select 'antes: B vê o perfil de A', '1', count(*)::text
  from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into resultado (teste, esperado, obtido)
select 'antes: B vê a foto de A', '1', count(*)::text
  from public.country_photos where id = 'cccccccc-0000-4000-8000-000000000003';

insert into resultado (teste, esperado, obtido)
select 'antes: B vê a conversa', '1', count(*)::text
  from public.conversations where id = 'dddddddd-0000-4000-8000-000000000004';

insert into resultado (teste, esperado, obtido)
select 'antes: B vê a mensagem', '1', count(*)::text
  from public.messages where id = 'eeeeeeee-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- A bloqueia B.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into resultado (teste, esperado, obtido)
select 'block_user(B) retorna true', 'true',
       public.block_user('bbbbbbbb-0000-4000-8000-000000000002')::text;

insert into resultado (teste, esperado, obtido)
select 'block_user de novo é idempotente (false, sem erro)', 'false',
       public.block_user('bbbbbbbb-0000-4000-8000-000000000002')::text;

insert into resultado (teste, esperado, obtido)
select 'is_blocked_either_way(A,B)', 'true',
       public.is_blocked_either_way('aaaaaaaa-0000-4000-8000-000000000001',
                                    'bbbbbbbb-0000-4000-8000-000000000002')::text;

insert into resultado (teste, esperado, obtido)
select 'is_blocked_either_way(B,A) — mútuo', 'true',
       public.is_blocked_either_way('bbbbbbbb-0000-4000-8000-000000000002',
                                    'aaaaaaaa-0000-4000-8000-000000000001')::text;

reset role;
insert into resultado (teste, esperado, obtido)
select 'o seguir foi desfeito nos dois sentidos', '0', count(*)::text
  from public.followers
 where (follower_id = 'aaaaaaaa-0000-4000-8000-000000000001' and following_id = 'bbbbbbbb-0000-4000-8000-000000000002')
    or (follower_id = 'bbbbbbbb-0000-4000-8000-000000000002' and following_id = 'aaaaaaaa-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- DEPOIS do bloqueio, como B (que NÃO bloqueou ninguém): tudo some.
-- É este bloco que prova a mutualidade.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into resultado (teste, esperado, obtido)
select 'depois: B NÃO vê o perfil de A', '0', count(*)::text
  from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into resultado (teste, esperado, obtido)
select 'depois: B NÃO vê a foto de A', '0', count(*)::text
  from public.country_photos where id = 'cccccccc-0000-4000-8000-000000000003';

insert into resultado (teste, esperado, obtido)
select 'depois: B NÃO vê a conversa', '0', count(*)::text
  from public.conversations where id = 'dddddddd-0000-4000-8000-000000000004';

insert into resultado (teste, esperado, obtido)
select 'depois: B NÃO vê a mensagem', '0', count(*)::text
  from public.messages where id = 'eeeeeeee-0000-4000-8000-000000000005';

insert into resultado (teste, esperado, obtido)
select 'depois: B NÃO vê a lista de participantes', '0', count(*)::text
  from public.conversation_participants
 where conversation_id = 'dddddddd-0000-4000-8000-000000000004';

insert into resultado (teste, esperado, obtido)
select 'B não enxerga quem o bloqueou (a lista é do dono)', '0', count(*)::text
  from public.blocked_users;

-- Escritas barradas: cada tentativa vira 'barrado' no relatório.
do $bloco$
begin
  begin
    insert into public.followers (follower_id, following_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001');
    insert into resultado (teste, esperado, obtido) values ('B NÃO consegue seguir A', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('B NÃO consegue seguir A', 'barrado', 'barrado');
  end;

  begin
    insert into public.comments (photo_id, user_id, content)
    values ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002', 'oi');
    insert into resultado (teste, esperado, obtido) values ('B NÃO consegue comentar na foto de A', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('B NÃO consegue comentar na foto de A', 'barrado', 'barrado');
  end;

  begin
    insert into public.messages (conversation_id, sender_id, body)
    values ('dddddddd-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'oi');
    insert into resultado (teste, esperado, obtido) values ('B NÃO consegue mandar DM para A', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('B NÃO consegue mandar DM para A', 'barrado', 'barrado');
  end;

  begin
    insert into public.blocked_users (blocker_id, blocked_id)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');
    insert into resultado (teste, esperado, obtido) values ('B NÃO escreve bloqueio em nome de A', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('B NÃO escreve bloqueio em nome de A', 'barrado', 'barrado');
  end;
end;
$bloco$;

-- ---------------------------------------------------------------------------
-- A desbloqueia: tudo volta.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into resultado (teste, esperado, obtido)
select 'unblock_user(B) retorna true', 'true',
       public.unblock_user('bbbbbbbb-0000-4000-8000-000000000002')::text;

insert into resultado (teste, esperado, obtido)
select 'unblock de novo é idempotente (false)', 'false',
       public.unblock_user('bbbbbbbb-0000-4000-8000-000000000002')::text;

select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into resultado (teste, esperado, obtido)
select 'após unblock: B volta a ver o perfil de A', '1', count(*)::text
  from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001';

insert into resultado (teste, esperado, obtido)
select 'após unblock: a conversa volta com o histórico', '1', count(*)::text
  from public.messages where id = 'eeeeeeee-0000-4000-8000-000000000005';

-- Auto-bloqueio continua barrado.
do $bloco2$
begin
  begin
    perform public.block_user('bbbbbbbb-0000-4000-8000-000000000002');
    perform public.block_user('bbbbbbbb-0000-4000-8000-000000000002');
    insert into resultado (teste, esperado, obtido) values ('bloquear a si mesmo', 'barrado',
      (select case when public.is_blocked_either_way('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002') then 'PASSOU' else 'barrado' end));
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('bloquear a si mesmo', 'barrado', 'barrado');
  end;
end;
$bloco2$;

reset role;

select ordem, teste, esperado, obtido,
       case when esperado = obtido then 'OK' else '*** FALHOU ***' end as veredito
  from resultado order by ordem;

rollback;
