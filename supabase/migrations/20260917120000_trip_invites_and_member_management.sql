-- Fase 2: convidar gente para a viagem e administrar quem está nela.
--
-- A Fase 0 criou a fundação (trip_members, papéis, RLS, a trava do último dono) e
-- já deixou `accept_trip_invite` e `leave_trip` prontas. O que falta é o começo do
-- fluxo: como alguém CHEGA na lista. São dois caminhos, e eles têm exigências
-- opostas de segurança.
--
--   1. CONVITE DIRETO a um usuário do Journi. Quem convida é dono, e a policy
--      "Owners invite members" da Fase 0 já cobre o INSERT. A RPC daqui existe
--      para validar o papel pedido e para o app ter uma porta só.
--
--   2. LINK COMPARTILHÁVEL. Aqui a policy da Fase 0 ATRAPALHA: quem resgata o
--      link não é dono da viagem, então o INSERT dele seria recusado. Por isso o
--      resgate é `security definer` — ele escreve em nome de quem tem permissão,
--      depois de provar que o portador apresentou um token válido.
--
-- O QUE O TOKEN PRECISA SUPORTAR, POR DECISÃO DE PRODUTO: um link por viagem,
-- reutilizável por várias pessoas, revogável pelo dono, com validade. É o
-- comportamento de convite de grupo que as pessoas já conhecem.
--
-- POR QUE O TOKEN NÃO PODE SER LIDO POR QUALQUER UM: o token É a credencial.
-- Quem o tem entra na viagem sem aprovação. Então a policy de SELECT de
-- trip_invites é de MEMBRO, não de autenticado — senão qualquer pessoa logada
-- listaria tokens de viagens alheias e entraria em todas.

begin;

-- ── Links de convite ─────────────────────────────────────────────────────────

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.travel_plans (id) on delete cascade,

  -- 32 hex = 128 bits de aleatoriedade, vindos do mesmo gerador que os ids desta
  -- base. Sem pgcrypto de propósito: uma extensão a mais é uma dependência a
  -- mais numa migração que roda em produção.
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),

  -- O papel que o link concede. 'owner' não entra: dono se promove por ação
  -- explícita do dono (set_trip_member_role), nunca por link que circula.
  role text not null default 'editor' check (role in ('editor', 'viewer')),

  created_by uuid references public.profiles (id) on delete set null,

  -- Validade e revogação. Os dois são nulos no caso comum; `expires_at` nasce
  -- preenchido pela RPC porque link de convite que nunca expira é credencial
  -- eterna vazando em print de conversa.
  expires_at timestamptz,
  revoked_at timestamptz,

  -- Contador de quantas pessoas entraram por este link. Não limita nada hoje:
  -- serve para o dono ver o efeito do link antes de decidir revogar.
  uses integer not null default 0,

  created_at timestamptz not null default now()
);

comment on table public.trip_invites is
  'Links de convite de viagem. O token é credencial: quem o apresenta entra sem aprovação, por isso o SELECT é restrito a membros e o resgate é security definer.';

create index if not exists trip_invites_trip_idx
  on public.trip_invites (trip_id);

alter table public.trip_invites enable row level security;

-- Membro vê os links da própria viagem (é como o dono revoga e como a tela
-- mostra o link ativo). Ninguém mais.
create policy "Members read trip invites"
  on public.trip_invites for select to authenticated
  using (public.is_trip_member(trip_id));

-- Criar e revogar é do dono. Editor e viewer não convidam — regra de produto.
create policy "Owners create trip invites"
  on public.trip_invites for insert to authenticated
  with check (public.is_trip_owner(trip_id) and created_by = auth.uid());

create policy "Owners update trip invites"
  on public.trip_invites for update to authenticated
  using (public.is_trip_owner(trip_id))
  with check (public.is_trip_owner(trip_id));

create policy "Owners delete trip invites"
  on public.trip_invites for delete to authenticated
  using (public.is_trip_owner(trip_id));

-- ── Convite direto a um usuário ──────────────────────────────────────────────

create or replace function public.invite_trip_member(
  p_trip_id uuid,
  p_user_id uuid,
  p_role text default 'editor'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'invite_trip_member: sem sessão';
  end if;

  -- A checagem é explícita mesmo sendo security definer: sem ela, esta função
  -- seria um buraco por onde qualquer membro convidaria gente.
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Só quem organiza a viagem pode convidar participantes.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('editor', 'viewer') then
    raise exception 'Papel inválido para convite: %', p_role
      using errcode = 'check_violation';
  end if;

  if public.is_blocked_either_way(auth.uid(), p_user_id) then
    raise exception 'Não é possível convidar esta pessoa.'
      using errcode = 'insufficient_privilege';
  end if;

  -- SEM LIMITE DE PARTICIPANTES, DE PROPÓSITO.
  --
  -- Anotação de produto para não se perder: existe a ideia de um plano pago que
  -- libere mais de N participantes por viagem. NADA disso está construído — não
  -- há contagem, não há teto, não há verificação de assinatura. Se um dia
  -- existir, o lugar é aqui, antes do insert, e o erro precisa dizer ao dono o
  -- que fazer em vez de só recusar.
  insert into public.trip_members (trip_id, user_id, role, status, invited_by)
  values (p_trip_id, p_user_id, p_role, 'pending', auth.uid())
  on conflict (trip_id, user_id) do nothing;
end;
$$;

-- ── Resgate do link ──────────────────────────────────────────────────────────

create or replace function public.redeem_trip_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  convite record;
  ja_membro boolean;
begin
  -- Sem sessão não entra: quem recebe o link precisa ter conta no Journi. É
  -- regra de produto, e é o que torna o token inútil para quem não se cadastra.
  if auth.uid() is null then
    raise exception 'Entre na sua conta do Journi para aceitar o convite.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into convite
    from public.trip_invites
   where token = p_token;

  -- Mensagem igual para token inexistente, revogado e expirado. Distinguir
  -- ajudaria quem está adivinhando tokens a saber que acertou a viagem.
  if convite is null
     or convite.revoked_at is not null
     or (convite.expires_at is not null and convite.expires_at < now()) then
    raise exception 'Este convite não é mais válido.'
      using errcode = 'no_data_found';
  end if;

  if public.is_blocked_either_way(convite.created_by, auth.uid()) then
    raise exception 'Este convite não é mais válido.'
      using errcode = 'no_data_found';
  end if;

  select exists (
    select 1 from public.trip_members
     where trip_id = convite.trip_id and user_id = auth.uid()
  ) into ja_membro;

  -- Idempotente: abrir o mesmo link duas vezes leva à viagem nas duas, sem
  -- rebaixar quem já é dono nem inflar o contador.
  if ja_membro then
    update public.trip_members
       set status = 'accepted', joined_at = coalesce(joined_at, now())
     where trip_id = convite.trip_id
       and user_id = auth.uid()
       and status = 'pending';
    return convite.trip_id;
  end if;

  -- 'accepted' direto, não 'pending': por decisão de produto, abrir o link
  -- logado JÁ coloca a pessoa na viagem — não há segunda aprovação do dono.
  insert into public.trip_members (trip_id, user_id, role, status, invited_by, joined_at)
  values (convite.trip_id, auth.uid(), convite.role, 'accepted', convite.created_by, now());

  update public.trip_invites
     set uses = uses + 1
   where id = convite.id;

  return convite.trip_id;
end;
$$;

comment on function public.redeem_trip_invite(text) is
  'security definer porque quem resgata não é dono da viagem, e a policy de INSERT de trip_members exige ser dono. A permissão vem de apresentar um token válido.';

-- ── Criar e revogar o link ───────────────────────────────────────────────────

create or replace function public.create_trip_invite_link(
  p_trip_id uuid,
  p_role text default 'editor',
  p_valid_days integer default 30
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo_token text;
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Só quem organiza a viagem pode gerar link de convite.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('editor', 'viewer') then
    raise exception 'Papel inválido para convite: %', p_role
      using errcode = 'check_violation';
  end if;

  -- Um link ATIVO por viagem e papel: gerar um novo revoga o anterior. Sem isso,
  -- cada toque no botão deixaria mais uma credencial viva por aí, e revogar
  -- deixaria de significar alguma coisa.
  update public.trip_invites
     set revoked_at = now()
   where trip_id = p_trip_id
     and role = p_role
     and revoked_at is null;

  insert into public.trip_invites (trip_id, role, created_by, expires_at)
  values (
    p_trip_id,
    p_role,
    auth.uid(),
    case when p_valid_days is null then null else now() + make_interval(days => p_valid_days) end
  )
  returning token into novo_token;

  return novo_token;
end;
$$;

create or replace function public.revoke_trip_invites(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Só quem organiza a viagem pode revogar o link.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.trip_invites
     set revoked_at = now()
   where trip_id = p_trip_id
     and revoked_at is null;
end;
$$;

-- ── Administrar participantes ────────────────────────────────────────────────

create or replace function public.set_trip_member_role(
  p_trip_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Só quem organiza a viagem pode mudar papéis.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Papel inválido: %', p_role
      using errcode = 'check_violation';
  end if;

  -- PROMOVER A DONO É PERMITIDO E PODE HAVER VÁRIOS: é assim que o dono único
  -- consegue sair da viagem depois. Rebaixar o último dono não passa — o trigger
  -- prevent_last_trip_owner_removal da Fase 0 recusa, com mensagem própria.
  update public.trip_members
     set role = p_role,
         -- Quem é promovido entra como aceito: um dono 'pending' não conseguiria
         -- editar nem administrar, e seria um dono só no nome.
         status = case when p_role = 'owner' then 'accepted' else status end,
         joined_at = case
           when p_role = 'owner' then coalesce(joined_at, now())
           else joined_at
         end
   where trip_id = p_trip_id
     and user_id = p_user_id;
end;
$$;

create or replace function public.remove_trip_member(
  p_trip_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_trip_owner(p_trip_id) then
    raise exception 'Só quem organiza a viagem pode remover participantes.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Remover a si mesmo é sair da viagem, e sair tem regra própria (a trava do
  -- último dono). Mandar para a porta certa evita um dono se remover por um
  -- caminho que não checa isso.
  if p_user_id = auth.uid() then
    raise exception 'Para sair da viagem, use a opção de sair.'
      using errcode = 'check_violation';
  end if;

  delete from public.trip_members
   where trip_id = p_trip_id
     and user_id = p_user_id;
end;
$$;

-- ── Permissões de execução ───────────────────────────────────────────────────

revoke all on function public.invite_trip_member(uuid, uuid, text) from public, anon;
revoke all on function public.redeem_trip_invite(text) from public, anon;
revoke all on function public.create_trip_invite_link(uuid, text, integer) from public, anon;
revoke all on function public.revoke_trip_invites(uuid) from public, anon;
revoke all on function public.set_trip_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.remove_trip_member(uuid, uuid) from public, anon;

grant execute on function public.invite_trip_member(uuid, uuid, text) to authenticated;
grant execute on function public.redeem_trip_invite(text) to authenticated;
grant execute on function public.create_trip_invite_link(uuid, text, integer) to authenticated;
grant execute on function public.revoke_trip_invites(uuid) to authenticated;
grant execute on function public.set_trip_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;

-- ── Herdeiro da conta apagada: preferir quem já é dono ───────────────────────
--
-- A Fase 0 elege o participante aceito MAIS ANTIGO. Funciona, mas com vários
-- donos possíveis (novidade desta fase) ela pode promover um editor enquanto um
-- dono já existia na viagem. A ordenação passa a preferir dono.
create or replace function public.transfer_trips_before_purge(target uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  viagem record;
  herdeiro uuid;
  transferidas integer := 0;
begin
  for viagem in
    select tp.id
      from public.travel_plans tp
     where tp.user_id = target
  loop
    select m.user_id into herdeiro
      from public.trip_members m
     where m.trip_id = viagem.id
       and m.user_id <> target
       and m.status = 'accepted'
     order by
       -- Dono que já existe herda antes de qualquer editor.
       case when m.role = 'owner' then 0 else 1 end,
       coalesce(m.joined_at, m.created_at) asc,
       m.created_at asc
     limit 1;

    if herdeiro is null then
      continue; -- Viagem de uma pessoa só: segue para o delete normal.
    end if;

    update public.trip_members
       set role = 'owner', joined_at = coalesce(joined_at, now())
     where trip_id = viagem.id
       and user_id = herdeiro;

    update public.travel_plans
       set user_id = herdeiro
     where id = viagem.id;

    delete from public.trip_members
     where trip_id = viagem.id
       and user_id = target;

    transferidas := transferidas + 1;
  end loop;

  return transferidas;
end;
$$;

revoke all on function public.transfer_trips_before_purge(uuid) from public, anon, authenticated;
grant execute on function public.transfer_trips_before_purge(uuid) to service_role;

commit;
