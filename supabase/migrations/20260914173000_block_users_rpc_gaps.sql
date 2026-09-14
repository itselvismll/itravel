-- Fecha três buracos do bloqueio que as policies da 20260914170000 não alcançam.
--
-- POR QUE UMA SEGUNDA MIGRAÇÃO
--
-- RLS só vale para quem lê a tabela DIRETO. Três caminhos de leitura do app não
-- fazem isso, e cada um pelo seu motivo:
--
--   1. `get_or_create_direct_conversation` é `security definer` — roda como dono
--      da função e ignora as policies. Quem foi bloqueado não consegue ler nem
--      escrever na conversa, mas ainda conseguiria CRIÁ-LA: a tela abriria uma
--      conversa vazia com a pessoa que o bloqueou, que é meio caminho para o
--      assédio que o bloqueio deveria impedir.
--   2. `get_unread_message_count`, idem: contaria como não lida a mensagem de uma
--      conversa que está escondida, e o app mostraria um badge que não abre nada.
--   3. `visited_countries` não tinha filtro de bloqueio, e é de onde sai a lista
--      de "viajantes sugeridos". Hoje o bloqueado some de lá por acidente — o
--      cliente pula a linha cujo `profiles` embutido veio nulo. Isso não é uma
--      garantia: é um efeito colateral de como a consulta foi escrita, e some no
--      dia em que alguém trocar o embed por um join.
begin;

-- ---------------------------------------------------------------------------
-- 1. Não abrir conversa com quem bloqueou
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  current_user_id uuid := auth.uid();
  conversation_uuid uuid;
begin
  if current_user_id is null or other_user_id is null or current_user_id = other_user_id then
    raise exception 'Participante inválido';
  end if;

  -- A checagem vive AQUI, e não na tela: esta função é `security definer` e é o
  -- único ponto por onde nasce uma conversa direta.
  if public.is_blocked_either_way(current_user_id, other_user_id) then
    raise exception 'Conversa indisponível';
  end if;

  select participant.conversation_id into conversation_uuid
  from public.conversation_participants participant
  where participant.user_id in (current_user_id, other_user_id)
  group by participant.conversation_id
  having count(distinct participant.user_id) = 2
    and (select count(*) from public.conversation_participants all_participants where all_participants.conversation_id = participant.conversation_id) = 2
  limit 1;

  if conversation_uuid is null then
    insert into public.conversations (created_by) values (current_user_id) returning id into conversation_uuid;
    insert into public.conversation_participants (conversation_id, user_id)
    values (conversation_uuid, current_user_id), (conversation_uuid, other_user_id);
  end if;
  return conversation_uuid;
end;
$function$;

-- `create or replace` reaplica os default privileges do Supabase; o revoke tem de
-- vir depois (mesma armadilha da 20260911160000).
revoke all on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Não contar mensagem de conversa bloqueada
-- ---------------------------------------------------------------------------

create or replace function public.get_unread_message_count()
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $function$
  select count(*)
  from public.messages as message
  where message.sender_id <> auth.uid()
    and message.read_at is null
    and public.is_conversation_participant(message.conversation_id)
    and not public.conversation_has_block(message.conversation_id);
$function$;

revoke all on function public.get_unread_message_count() from public, anon;
grant execute on function public.get_unread_message_count() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Países visitados e wishlist somem junto com o perfil
-- ---------------------------------------------------------------------------
--
-- `visited_countries` alimenta os viajantes sugeridos e o perfil público. Com o
-- filtro aqui, a sugestão deixa de depender de como o cliente escreveu a
-- consulta. A wishlist entra pelo mesmo motivo e pelo mesmo custo.

drop policy if exists visited_countries_select on public.visited_countries;
create policy visited_countries_select on public.visited_countries
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_account_active(user_id)
      and not public.is_blocked_either_way(auth.uid(), user_id)
    )
  );

drop policy if exists wishlist_select on public.wishlist;
create policy wishlist_select on public.wishlist
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_account_active(user_id)
      and not public.is_blocked_either_way(auth.uid(), user_id)
    )
  );

commit;
