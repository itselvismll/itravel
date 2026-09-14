-- Verificação dos buracos fechados pela 20260914173000. Termina em ROLLBACK.
begin;

create temporary table resultado (
  ordem serial, teste text, esperado text, obtido text
) on commit drop;
grant all on resultado to authenticated;
grant usage, select on sequence resultado_ordem_seq to authenticated;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('aaaaaaaa-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gap-a@exemplo.invalido', 'x',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb),
  ('bbbbbbbb-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'gap-b@exemplo.invalido', 'x',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, username)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'gapa'),
       ('bbbbbbbb-0000-4000-8000-00000000000b', 'gapb')
on conflict (id) do nothing;

insert into public.visited_countries (user_id, country_code, country_name)
values ('aaaaaaaa-0000-4000-8000-00000000000a', 'BRA', 'Brasil');

-- A bloqueia B.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select public.block_user('bbbbbbbb-0000-4000-8000-00000000000b');

-- Agora como B, que não bloqueou ninguém.
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);

insert into resultado (teste, esperado, obtido)
select 'B NÃO vê os países visitados de A', '0', count(*)::text
  from public.visited_countries where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a';

do $bloco$
begin
  begin
    perform public.get_or_create_direct_conversation('aaaaaaaa-0000-4000-8000-00000000000a');
    insert into resultado (teste, esperado, obtido)
      values ('B NÃO consegue abrir conversa com A', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido)
      values ('B NÃO consegue abrir conversa com A', 'barrado', 'barrado');
  end;
end;
$bloco$;

insert into resultado (teste, esperado, obtido)
select 'contador de não lidas ignora conversa bloqueada', '0',
       public.get_unread_message_count()::text;

-- Desbloqueado, a conversa volta a poder ser aberta.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select public.unblock_user('bbbbbbbb-0000-4000-8000-00000000000b');

select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);

do $bloco2$
begin
  begin
    perform public.get_or_create_direct_conversation('aaaaaaaa-0000-4000-8000-00000000000a');
    insert into resultado (teste, esperado, obtido)
      values ('após unblock: B abre conversa normalmente', 'ok', 'ok');
  exception when others then
    insert into resultado (teste, esperado, obtido)
      values ('após unblock: B abre conversa normalmente', 'ok', 'BARRADO INDEVIDAMENTE');
  end;
end;
$bloco2$;

insert into resultado (teste, esperado, obtido)
select 'após unblock: B volta a ver os países de A', '1', count(*)::text
  from public.visited_countries where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a';

reset role;
select ordem, teste, esperado, obtido,
       case when esperado = obtido then 'OK' else '*** FALHOU ***' end as veredito
  from resultado order by ordem;

rollback;
