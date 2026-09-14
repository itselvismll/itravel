-- Conferência do teste manual em produção (bloqueio + denúncia).
-- Somente leitura. Rodar no SQL Editor do Dashboard, que usa service_role e
-- portanto ignora a RLS — pelas policies de reports/blocked_users/followers,
-- nenhum cliente com anon key consegue ver estas linhas.

-- 1. A denúncia enviada pela UI.
select r.id,
       r.reporter_id,
       pr.username as reporter_username,
       r.target_type,
       r.target_id,
       pt.username as target_username,   -- preenche só quando target_type = 'profile'
       r.reason,
       r.status,
       r.created_at
from public.reports r
left join public.profiles pr on pr.id = r.reporter_id
left join public.profiles pt on pt.id = r.target_id and r.target_type = 'profile'
order by r.created_at desc
limit 5;

-- 2. O bloqueio gravado. blocker_id tem de ser VOCÊ e blocked_id o usuário de teste.
select b.blocker_id,
       pb.username as blocker_username,
       b.blocked_id,
       pd.username as blocked_username,
       b.created_at
from public.blocked_users b
left join public.profiles pb on pb.id = b.blocker_id
left join public.profiles pd on pd.id = b.blocked_id
order by b.created_at desc
limit 5;

-- 3. O seguir desfeito nos dois sentidos.
-- Troque os dois usernames pelos do teste; o esperado é ZERO linhas.
with par as (
  select (select id from public.profiles where username = 'SEU_USERNAME')   as a,
         (select id from public.profiles where username = 'USERNAME_TESTE') as b
)
select f.*  -- `followers` foi criada fora das migrations; nao assumo as colunas
from public.followers f, par
where (f.follower_id = par.a and f.following_id = par.b)
   or (f.follower_id = par.b and f.following_id = par.a);
