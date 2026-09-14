-- Verificação das denúncias (20260914180000). Termina em ROLLBACK: roda contra
-- produção sem deixar usuário nem denúncia de teste para trás.
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
  ('aaaaaaaa-0000-4000-8000-0000000000da', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'report-a@exemplo.invalido', 'x',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb),
  ('bbbbbbbb-0000-4000-8000-0000000000db', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'report-b@exemplo.invalido', 'x',
   now(), now(), now(), '{"provider":"email"}'::jsonb, '{}'::jsonb);

insert into public.profiles (id, username)
values ('aaaaaaaa-0000-4000-8000-0000000000da', 'reporta'),
       ('bbbbbbbb-0000-4000-8000-0000000000db', 'reportb')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000da","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Os quatro target_types gravam certo.
-- ---------------------------------------------------------------------------
select public.create_report('photo',   '11111111-0000-4000-8000-000000000001', 'Conteúdo impróprio', null);
select public.create_report('comment', '22222222-0000-4000-8000-000000000002', 'Assédio ou bullying', 'detalhe livre');
select public.create_report('profile', 'bbbbbbbb-0000-4000-8000-0000000000db', 'Spam', null);
select public.create_report('message', '44444444-0000-4000-8000-000000000004', 'Informação falsa', null);

insert into resultado (teste, esperado, obtido)
select 'os 4 target_types gravaram', 'photo,comment,profile,message',
       string_agg(target_type, ',' order by created_at)
  from public.reports where reporter_id = 'aaaaaaaa-0000-4000-8000-0000000000da';

insert into resultado (teste, esperado, obtido)
select 'status nasce pending', '4', count(*)::text
  from public.reports
 where reporter_id = 'aaaaaaaa-0000-4000-8000-0000000000da' and status = 'pending';

insert into resultado (teste, esperado, obtido)
select 'details opcional grava quando vem, fica null quando não vem', 'detalhe livre|',
       coalesce(max(details) filter (where target_type = 'comment'), '') || '|' ||
       coalesce(max(details) filter (where target_type = 'photo'), '')
  from public.reports where reporter_id = 'aaaaaaaa-0000-4000-8000-0000000000da';

-- A repetição é gravada num statement próprio: medir o efeito de um insert
-- dentro do mesmo SELECT que o dispara deixa a ordem de avaliação por conta do
-- planejador — foi o que fez esta asserção falhar medindo o estado anterior.
select public.create_report('photo', '11111111-0000-4000-8000-000000000001', 'Conteúdo impróprio', null);

insert into resultado (teste, esperado, obtido)
select 'denúncia repetida do mesmo alvo é aceita (é sinal, não duplicata)', '2', count(*)::text
  from public.reports
 where reporter_id = 'aaaaaaaa-0000-4000-8000-0000000000da'
   and target_type = 'photo'
   and target_id = '11111111-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Validações que precisam falhar.
-- ---------------------------------------------------------------------------
do $bloco$
begin
  begin
    perform public.create_report('photo', '11111111-0000-4000-8000-000000000001', '   ', null);
    insert into resultado (teste, esperado, obtido) values ('motivo vazio', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('motivo vazio', 'barrado', 'barrado');
  end;

  begin
    perform public.create_report('viagem', '11111111-0000-4000-8000-000000000001', 'Spam', null);
    insert into resultado (teste, esperado, obtido) values ('target_type fora do enum', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('target_type fora do enum', 'barrado', 'barrado');
  end;

  begin
    perform public.create_report('photo', null, 'Spam', null);
    insert into resultado (teste, esperado, obtido) values ('alvo nulo', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('alvo nulo', 'barrado', 'barrado');
  end;

  begin
    perform public.create_report('profile', 'aaaaaaaa-0000-4000-8000-0000000000da', 'Spam', null);
    insert into resultado (teste, esperado, obtido) values ('denunciar o próprio perfil', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('denunciar o próprio perfil', 'barrado', 'barrado');
  end;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values ('aaaaaaaa-0000-4000-8000-0000000000da', 'photo', '11111111-0000-4000-8000-000000000001', 'x');
    insert into resultado (teste, esperado, obtido) values ('INSERT direto (sem a RPC) é barrado', 'barrado', 'PASSOU');
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('INSERT direto (sem a RPC) é barrado', 'barrado', 'barrado');
  end;
end;
$bloco$;

-- ---------------------------------------------------------------------------
-- RLS: cada um só enxerga as próprias denúncias.
-- ---------------------------------------------------------------------------
insert into resultado (teste, esperado, obtido)
select 'A vê as próprias denúncias', '5', count(*)::text from public.reports;

select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-0000-4000-8000-0000000000db","role":"authenticated"}', true);

insert into resultado (teste, esperado, obtido)
select 'B NÃO vê as denúncias de A', '0', count(*)::text from public.reports;

insert into resultado (teste, esperado, obtido)
select 'B NÃO vê nem a denúncia feita CONTRA ele', '0', count(*)::text
  from public.reports where target_id = 'bbbbbbbb-0000-4000-8000-0000000000db';

do $bloco2$
begin
  begin
    update public.reports set status = 'dismissed';
    insert into resultado (teste, esperado, obtido)
      values ('ninguém muda o status pelo app', 'barrado',
              (select case when count(*) = 0 then 'barrado' else 'PASSOU' end
                 from public.reports where status = 'dismissed'));
  exception when others then
    insert into resultado (teste, esperado, obtido) values ('ninguém muda o status pelo app', 'barrado', 'barrado');
  end;
end;
$bloco2$;

reset role;
select ordem, teste, esperado, obtido,
       case when esperado = obtido then 'OK' else '*** FALHOU ***' end as veredito
  from resultado order by ordem;

rollback;
