-- Os perfis de quem eu bloqueei, para a tela "Usuários bloqueados".
--
-- O PROBLEMA QUE ESTA FUNÇÃO RESOLVE
--
-- A policy de `profiles` (20260914170000) esconde exatamente quem está
-- bloqueado. Isso é o certo em toda a parte do app — e torna a tela de
-- desbloqueio impossível de escrever: `blocked_users` devolve os uuid, e o join
-- com `profiles` volta vazio em TODA linha. A lista viraria uma coluna de
-- identificadores, sem nome nem foto, e ninguém consegue desbloquear com
-- segurança alguém que não sabe quem é.
--
-- A saída é uma função `security definer` estreita: devolve APENAS os perfis que
-- o próprio solicitante bloqueou, e só os campos de exibição. Não é uma brecha
-- na policy — é o único caso em que a pessoa tem direito de ver o que ela mesma
-- escondeu, porque foi ela que escondeu.
begin;

create or replace function public.get_blocked_profiles()
returns table (
  blocked_id uuid,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.blocked_id,
    p.username,
    p.display_name,
    p.avatar_url,
    b.created_at
  from public.blocked_users b
  -- `left join`: a conta bloqueada pode ter sido excluída depois do bloqueio, e
  -- nesse caso a linha ainda precisa aparecer para poder ser desfeita. Some o
  -- nome, não o item.
  left join public.profiles p on p.id = b.blocked_id
  -- A cláusula que faz esta função ser estreita: só o que EU bloqueei.
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

revoke all on function public.get_blocked_profiles() from public, anon;
grant execute on function public.get_blocked_profiles() to authenticated;

commit;
