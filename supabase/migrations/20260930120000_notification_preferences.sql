-- Preferências de notificação: o interruptor por categoria, e o filtro no banco.
--
-- Este arquivo faz TRÊS coisas, nesta ordem:
--
--   1. a tabela `notification_preferences` e sua RLS;
--   2. o filtro — um trigger BEFORE INSERT em `notifications` que vale para todos
--      os caminhos que criam aviso;
--   3. a volta do aviso de MENSAGEM DIRETA, que a 20260812130000 havia removido
--      de propósito, agora agrupado por conversa (ver a seção no fim).
--
-- POR QUE O FILTRO FICA NUM TRIGGER, E NÃO EM CADA CAMINHO
--
-- Hoje existem SETE caminhos que inserem em `public.notifications`:
-- `notify_new_follower`, `notify_comment_once`, `sync_photo_like_notification`,
-- `notify_trip_membership` (que gera dois tipos), `log_trip_edit`,
-- `notify_trip_task_created` e `notify_trip_task_done`. Checar preferência dentro
-- de cada um seria sete lugares para errar hoje e um esquecimento garantido no
-- oitavo trigger que alguém escrever no mês que vem — e o sintoma desse
-- esquecimento é o pior possível: a pessoa desliga uma categoria, continua
-- recebendo, e não há nada na tela que explique.
--
-- Um BEFORE INSERT na própria `notifications` fecha a porta por onde todos
-- passam. Os inserts existentes continuam escritos como estão, e os que vierem
-- depois nascem filtrados sem saber que o filtro existe.
--
-- A EXCEÇÃO É O OITAVO CAMINHO, criado neste mesmo arquivo: `notify_new_message`
-- agrupa por conversa ATUALIZANDO uma linha existente, e um UPDATE não passa por
-- trigger de INSERT. Por isso a regra foi extraída para
-- `notification_enabled_for`, que os dois consultam — ver o comentário dela.
--
-- FOR EACH ROW importa: quatro desses inserts são `insert ... select` sobre
-- `trip_members`, gravando uma linha por participante da viagem. O trigger roda
-- por linha, então quem desligou a categoria perde a sua e os outros recebem a
-- deles. Um STATEMENT trigger não conseguiria fazer essa distinção.
--
-- NENHUM INSERT USA `RETURNING`
--
-- Verificado em todas as migrações e em todo o `src/`: não existe
-- `insert into notifications ... returning`, e o app só LÊ e MARCA COMO LIDA a
-- tabela (nenhum insert pelo PostgREST). Isso é o que torna seguro um trigger que
-- devolve null: um `RETURNING` sobre linha descartada voltaria vazio, e um
-- `strict` ou um `into` do lado chamador quebraria a transação inteira — ou seja,
-- desligar notificação derrubaria a ação que a gerou. Quem acrescentar
-- `RETURNING` aqui precisa ler este parágrafo primeiro.
--
-- O QUE ESTE ARQUIVO NÃO FAZ
--
-- Não apaga aviso já recebido. Desligar uma categoria vale para o que vem; o que
-- já está no sino continua lá para ser lido, porque apagar o passado de alguém
-- porque ele mudou uma preferência é perder dado que ele ainda não viu.
--
-- Não precisa de backfill: AUSÊNCIA DE LINHA É "TUDO LIGADO". O trigger devolve
-- `new` quando não encontra preferência, então a base inteira segue como hoje sem
-- uma única linha gravada, e a tabela só cresce com quem de fato mexeu em algo.

begin;

-- ── A tabela ────────────────────────────────────────────────────────────────
--
-- Uma coluna por categoria, e não um jsonb: coluna é o que o Postgres sabe
-- validar, o que o `to_jsonb(linha) ->> categoria` do trigger lê sem custo, e o
-- que falha alto quando a tela grava um nome de categoria que não existe. Com
-- jsonb, um erro de digitação na chave gravaria quieto e o interruptor não faria
-- nada.
--
-- `all_enabled` é SEPARADA das colunas de categoria de propósito: pausar tudo não
-- pode custar as escolhas. Desligar o geral não escreve uma única vez nas outras
-- colunas, então religar devolve exatamente o que estava — inclusive as
-- categorias que já estavam desligadas antes da pausa.
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,

  all_enabled boolean not null default true,

  social_follows boolean not null default true,
  social_comments boolean not null default true,
  social_likes boolean not null default true,
  social_messages boolean not null default true,

  trip_invites boolean not null default true,
  trip_joins boolean not null default true,
  trip_edits boolean not null default true,
  trip_tasks boolean not null default true,

  updated_at timestamptz not null default now()
);

create or replace function public.touch_notification_preferences()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_notification_preferences on public.notification_preferences;
create trigger touch_notification_preferences
  before update on public.notification_preferences
  for each row execute function public.touch_notification_preferences();

-- ── RLS: cada um com a sua linha ────────────────────────────────────────────
--
-- Sem DELETE de propósito. Apagar a linha é indistinguível de "tudo ligado", e a
-- tela não tem esse botão; deixar a política de fora evita um caminho que zera as
-- escolhas de alguém sem que ele tenha pedido isso em lugar nenhum.
alter table public.notification_preferences enable row level security;

drop policy if exists "Own notification preferences read" on public.notification_preferences;
create policy "Own notification preferences read"
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Own notification preferences insert" on public.notification_preferences;
create policy "Own notification preferences insert"
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Own notification preferences update" on public.notification_preferences;
create policy "Own notification preferences update"
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Tipo → categoria ────────────────────────────────────────────────────────
--
-- ESTA FUNÇÃO TEM UM GÊMEO EM JS: `src/utils/notificationCategories.js`, que é o
-- que a tela usa para desenhar as seções. Duas tabelas iguais divergem em
-- silêncio, então `tests/notification-preferences.test.cjs` lê o CASE daqui e
-- compara com o mapa de lá — mexeu num, o teste cobra o outro.
--
-- `else null` É A REGRA, NÃO O DESCUIDO: tipo desconhecido, ou tipo sem
-- interruptor, volta null e o trigger deixa passar. O custo de errar para este
-- lado é um aviso a mais; para o outro lado é um aviso que nunca chega e que
-- ninguém consegue diagnosticar, porque não há erro nem linha em lugar algum.
--
-- HOJE TODO TIPO VIVO ESTÁ MAPEADO. O `else` existe para o tipo que alguém
-- acrescentar amanhã e esquecer aqui — ele chega, em vez de desaparecer.
create or replace function public.notification_category(p_type text)
returns text
language sql
immutable
as $$
  select case p_type
    when 'follow' then 'social_follows'
    when 'comment' then 'social_comments'
    when 'like' then 'social_likes'
    -- Mensagem direta voltou a ser notificação nesta migração, mais abaixo. Até
    -- aqui ela não passava por `notifications` — ver a 20260812130000, que
    -- derrubou o trigger antigo, e o cabeçalho da seção "Mensagem direta".
    when 'message' then 'social_messages'
    -- Passaporte compartilhado DIVIDE a categoria com mensagem direta, e não tem
    -- interruptor próprio na tela: ele chega pelo chat, como anexo de uma
    -- mensagem, e quem desliga "mensagens diretas" está desligando o que chega
    -- por ali. Uma linha separada para ele daria a entender que existe um segundo
    -- canal, quando é o mesmo.
    when 'passport' then 'social_messages'
    when 'trip_invite' then 'trip_invites'
    when 'trip_joined' then 'trip_joins'
    when 'trip_edit' then 'trip_edits'
    -- Criada e concluída dividem o mesmo interruptor: são os dois lados do mesmo
    -- assunto, e ninguém quer receber uma e não a outra.
    when 'trip_task_created' then 'trip_tasks'
    when 'trip_task_done' then 'trip_tasks'
    else null
  end
$$;

-- ── O filtro ────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER porque a função lê a preferência do DESTINATÁRIO, e a RLS acima
-- só deixa cada um ler a própria linha. Quem insere o aviso é sempre outra pessoa
-- (quem seguiu, quem comentou, quem editou a viagem), então sob a RLS do chamador
-- o `select` voltaria zero linhas — e "zero linhas" significa "tudo ligado". O
-- filtro simplesmente nunca barraria nada: um bug que passa em todo teste feito
-- com uma conta só.
--
-- `search_path = ''` e todo nome qualificado, como no resto do projeto: definer
-- com search_path aberto é por onde se sequestra uma função.
--
-- EXECUTE revogado de public/anon/authenticated. O trigger continua disparando: o
-- Postgres cobra EXECUTE na criação do trigger, não a cada linha inserida.
-- A PERGUNTA, separada do trigger. Dois chamadores precisam fazê-la:
--
--   1. `filter_notification_by_preference`, o trigger BEFORE INSERT abaixo;
--   2. `notify_new_message`, que para agrupar o aviso por conversa ATUALIZA uma
--      linha existente em vez de inserir — e um UPDATE não passa por um trigger
--      de INSERT. Sem esta função, quem desligasse mensagens continuaria tendo o
--      aviso antigo reerguido a cada mensagem nova: o furo exato que um filtro só
--      no INSERT deixa aberto.
--
-- Escrever a regra duas vezes seria garantir que as duas versões divergissem.
create or replace function public.notification_enabled_for(p_user_id uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Sem categoria: passa. Ver o `else null` acima.
    when public.notification_category(p_type) is null then true
    else coalesce(
      (
        select case
          -- A pausa geral vem antes das categorias, e NÃO escreve nelas: é o que
          -- faz religar devolver exatamente o que estava.
          when p.all_enabled = false then false
          -- `to_jsonb` em vez de SQL dinâmico com `format('select ($1).%I')`: o
          -- nome da categoria vem de uma função nossa, mas montar SQL com ele
          -- seria construir a injeção e depois confiar na origem. O `coalesce`
          -- cobre a categoria que já está no mapa e ainda não tem coluna — ela
          -- passa, pela mesma regra do `else null`.
          else coalesce(
            (to_jsonb(p) ->> public.notification_category(p_type))::boolean,
            true
          )
        end
        from public.notification_preferences p
       where p.user_id = p_user_id
      ),
      -- Sem linha: tudo ligado. É o estado de toda a base hoje, e o que dispensa
      -- backfill.
      true
    )
  end;
$$;

revoke all on function public.notification_enabled_for(uuid, text) from public;

create or replace function public.filter_notification_by_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.notification_enabled_for(new.user_id, new.type) then
    return new;
  end if;

  -- Descarta a linha. O INSERT do chamador continua bem-sucedido e afeta zero
  -- linhas — ver o parágrafo sobre `RETURNING` no topo do arquivo.
  return null;
end;
$$;

revoke all on function public.filter_notification_by_preference() from public;

-- BEFORE INSERT, e não BEFORE INSERT OR UPDATE: marcar como lida é um UPDATE, e
-- um aviso que já chegou não deve desaparecer porque a preferência mudou depois.
drop trigger if exists filter_notification_by_preference on public.notifications;
create trigger filter_notification_by_preference
  before insert on public.notifications
  for each row execute function public.filter_notification_by_preference();

-- ════════════════════════════════════════════════════════════════════════════
-- MENSAGEM DIRETA VOLTA A SER NOTIFICAÇÃO
-- ════════════════════════════════════════════════════════════════════════════
--
-- A 20260812130000 tirou o aviso de DM de propósito ("Mensagens e passaportes
-- compartilhados pertencem exclusivamente à caixa de conversas"): derrubou
-- `notify_new_message`, apagou as linhas de tipo `message` e tirou `message` do
-- check de tipo. Desde então o que existe é um CONTADOR — `get_unread_message_count`
-- sobre `messages.read_at` —, não um aviso: nada aparece no sino, nada dispara
-- banner, e quem não abre a aba de conversas não descobre que recebeu mensagem.
--
-- POR QUE AGORA DÁ PARA VOLTAR, e não era caso de reverter aquela migração: o
-- motivo original de remover era duplicidade — uma linha de notificação POR
-- MENSAGEM, que numa conversa de trinta mensagens enchia o sino de trinta avisos
-- idênticos e tornava o resto invisível. O trigger abaixo agrupa POR CONVERSA, e
-- é isso que resolve o problema que levou à remoção.
--
-- A infraestrutura do tipo `message` nunca foi desmontada: a coluna
-- `notifications.conversation_id` e sua FK continuam lá (20260807193000), e
-- `src/utils/notificationRouting.js` ainda resolve `message` para a tela
-- `Conversation`. Só faltavam o tipo no check e o trigger.

-- `message` de volta no check. A lista inteira reescrita, porque `add constraint`
-- não sabe acrescentar um valor a um `in (...)` existente.
--
-- `passport` volta junto, e pelo mesmo motivo: ele também chega pelo chat. A
-- diferença é que passaporte NÃO é agrupado — ver `notify_shared_passport`.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'follow', 'comment', 'like',
    -- Mensagem direta: UMA linha por conversa não lida, atualizada a cada
    -- mensagem nova. Ver `notify_new_message`.
    'message',
    -- Passaporte compartilhado: UMA linha por passaporte, nunca agrupada. Ver
    -- `notify_shared_passport`.
    'passport',
    'trip_invite', 'trip_joined', 'trip_edit',
    'trip_task_created', 'trip_task_done'
  ));

-- O índice que o agrupamento usa: achar "o aviso não lido desta conversa para
-- esta pessoa" roda a cada mensagem enviada no app. Parcial em `read = false`
-- porque é só nessa fatia que a busca acontece, e ela é a minoria das linhas.
create index if not exists notifications_unread_conversation_idx
  on public.notifications (user_id, conversation_id)
  where type = 'message' and read = false;

-- ── O aviso, um por conversa ────────────────────────────────────────────────
--
-- UPDATE-ENTÃO-INSERT, e por que este padrão e não os outros dois do projeto:
--
--   `notify_comment_once` faz DELETE-então-INSERT. Serve para comentário porque
--   lá a linha antiga não carrega nada que valha preservar. Aqui ela carrega: o
--   `id` é o que a lista do sino usa como chave de React, e trocar o id a cada
--   mensagem faria a notificação piscar e perder posição na tela de quem está
--   olhando. Pior: DELETE + INSERT dispararia o BEFORE INSERT de novo e, com a
--   categoria desligada no meio do caminho, apagaria o aviso antigo sem pôr
--   nada no lugar.
--
--   `log_trip_edit` usa `not exists` com JANELA DE TEMPO (30 min). Serve para
--   edição porque lá o agrupamento é por sessão de trabalho. Aqui a janela certa
--   não é tempo, é LEITURA: o aviso deve continuar sendo um só até a pessoa abrir
--   a conversa, seja isso em dez segundos ou em três dias. Uma janela de tempo
--   daria dois avisos da mesma conversa não lida, que é o que a 20260812130000
--   removeu.
--
-- Então: tenta ATUALIZAR o aviso não lido daquela conversa (texto novo e
-- `created_at = now()`, para subir na lista, que ordena por `created_at desc`), e
-- só insere se não havia nenhum. `found` depois do UPDATE é o que distingue os
-- dois casos.
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  destinatario uuid;
  resumo text;
  autor uuid := new.sender_id;
begin
  -- O resumo que aparece embaixo do título no sino. Mesmo texto do trigger
  -- original (20260807193000): a mensagem pode não ter corpo nenhum, e aí o que
  -- descreve o que chegou é o tipo de anexo.
  resumo := left(
    coalesce(
      nullif(trim(new.body), ''),
      case
        when new.shared_photo is not null then 'Compartilhou uma publicação'
        when new.shared_plan is not null then 'Compartilhou um roteiro'
        else 'Enviou uma mensagem'
      end
    ),
    120
  );

  -- `conversation_participants` e não "o outro participante": as conversas hoje
  -- são 1:1, mas o loop já está certo para grupo, e é o mesmo formato do trigger
  -- original.
  for destinatario in
    select cp.user_id
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       -- Quem enviou não recebe aviso da própria mensagem.
       and cp.user_id <> autor
  loop
    -- BLOQUEIO: `is_blocked_either_way` é a função que o projeto já usa para
    -- isso (20260914170000), e vale nos dois sentidos. Ela não depende de
    -- `auth.uid()`, então funciona aqui dentro, onde não há sessão a consultar —
    -- é por isso que uso esta e não `conversation_has_block`.
    --
    -- Em teoria a conversa de quem se bloqueou já está escondida pela RLS; na
    -- prática o bloqueio pode acontecer DEPOIS de a conversa existir, e uma
    -- mensagem em trânsito não deve virar aviso.
    if public.is_blocked_either_way(autor, destinatario) then
      continue;
    end if;

    -- A preferência, checada aqui porque o caminho do UPDATE não passa pelo
    -- trigger BEFORE INSERT. Ver `notification_enabled_for`.
    if not public.notification_enabled_for(destinatario, 'message') then
      continue;
    end if;

    update public.notifications
       set actor_id = autor,
           preview = resumo,
           created_at = now()
     where user_id = destinatario
       and conversation_id = new.conversation_id
       and type = 'message'
       and read = false;

    -- `found` reflete o UPDATE acima: zero linhas significa que não há aviso
    -- pendente desta conversa, e aí o aviso nasce.
    if not found then
      insert into public.notifications (
        user_id, actor_id, type, message, preview, read, conversation_id
      ) values (
        destinatario, autor, 'message', 'enviou uma mensagem', resumo, false,
        new.conversation_id
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_new_message() from public;

-- `when (new.shared_passport_id is null)`, como no trigger original: passaporte
-- compartilhado chega como mensagem, mas o tipo `passport` não voltou ao check,
-- e avisar "enviou uma mensagem" para um passaporte descreveria errado o que
-- aconteceu.
--
-- AFTER INSERT: `touch_conversation_from_message` (20260812130000) já cuida do
-- `conversations.updated_at`, então este trigger não mexe nisso — dois triggers
-- escrevendo a mesma coluna é como se perde o rastro de quem a escreveu.
drop trigger if exists on_message_created_notify on public.messages;
create trigger on_message_created_notify
  after insert on public.messages
  for each row
  when (new.shared_passport_id is null)
  execute function public.notify_new_message();

-- ── Passaporte compartilhado ────────────────────────────────────────────────
--
-- CAMINHO PRÓPRIO, porque `notify_new_message` ignora este caso de propósito: o
-- `when (new.shared_passport_id is null)` dele existe para não dizer "enviou uma
-- mensagem" sobre um passaporte. Este trigger é o complemento exato — mesma
-- tabela, condição invertida —, então as duas condições juntas cobrem toda
-- mensagem inserida, sem sobreposição: nenhuma linha dispara os dois.
--
-- O TRIGGER É EM `messages`, E NÃO EM `passport_shares`, e esta é a diferença
-- relevante em relação ao `notify_received_passport` original (20260807193000):
--
--   1. `passport_shares` não tem `conversation_id`. Sem ele o aviso não poderia
--      ser marcado como lido quando a conversa é lida — era justamente o que
--      faltava na versão antiga, que só sabia o `passport_share_id`;
--   2. a ordem do cliente é "cria o passport_share, DEPOIS resolve a conversa e
--      manda a mensagem" (ver `shareWithUser` em src/services/messageService.js).
--      No instante do insert em `passport_shares` a conversa pode ainda não
--      existir, então um trigger ali não teria o que gravar.
--
-- SEM AGRUPAMENTO, ao contrário de mensagem: cada passaporte é uma coisa
-- específica para abrir, e não "você tem mensagem desta pessoa". Dois passaportes
-- são dois avisos. E o UPDATE de `notify_new_message` filtra `type = 'message'`,
-- então um aviso de passaporte nunca é absorvido por um de mensagem — os dois
-- tipos convivem na mesma conversa, lado a lado.
--
-- A PREFERÊNCIA NÃO É CHECADA AQUI, e isso é intencional: este caminho só INSERE,
-- então o trigger BEFORE INSERT já resolve. `notify_new_message` precisa checar
-- porque tem um caminho de UPDATE; aqui, repetir a checagem seria uma segunda
-- cópia da regra sem nada em troca.
create or replace function public.notify_shared_passport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  destinatario uuid;
  autor uuid := new.sender_id;
begin
  for destinatario in
    select cp.user_id
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id <> autor
  loop
    if public.is_blocked_either_way(autor, destinatario) then
      continue;
    end if;

    -- `passport_share_id` é o que o deep link usa (`notificationRouting` resolve
    -- `passport` para a tela PassportDetail por ele); `conversation_id` é o que
    -- `mark_conversation_read` usa. O aviso precisa dos dois, cada um para uma
    -- coisa.
    insert into public.notifications (
      user_id, actor_id, type, message, preview, read,
      passport_share_id, conversation_id
    ) values (
      destinatario, autor, 'passport', 'compartilhou um passaporte com você',
      'Abra para ver os países visitados e os próximos destinos', false,
      new.shared_passport_id, new.conversation_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.notify_shared_passport() from public;

-- A condição é o espelho exata do `when` de `on_message_created_notify`.
--
-- `shared_passport_id is not null` e não `shared_passport is not null`: quando o
-- insert em `passport_shares` falha, o cliente segue com um id local
-- (`local-passport-...`) e grava `shared_passport_id = null` com o snapshot no
-- jsonb. Aquele passaporte não existe no banco, então um aviso apontando para ele
-- abriria "Passaporte indisponível" — melhor não avisar do que avisar para o
-- vazio.
drop trigger if exists on_message_created_notify_passport on public.messages;
create trigger on_message_created_notify_passport
  after insert on public.messages
  for each row
  when (new.shared_passport_id is not null)
  execute function public.notify_shared_passport();

-- ── Ler a conversa marca o aviso como lido ──────────────────────────────────
--
-- Sem isto o sino ficaria preso: a pessoa abre a conversa, lê tudo, e o aviso
-- continua não lido porque nada no app toca naquela linha — a tela de
-- notificações marca como lido o que ELA lista, e quem abriu a conversa direto
-- nunca passou por lá. O contador do sino não zeraria, que é o pior defeito
-- possível num contador.
--
-- Dentro de `mark_conversation_read` porque é o ponto único por onde "li esta
-- conversa" acontece: ela já é chamada pela tela da conversa
-- (`src/services/messageService.js`), é `security definer`, e já valida que quem
-- chama participa. Um segundo caminho no app poderia esquecer de marcar; aqui não
-- há como.
--
-- O corpo anterior é preservado na íntegra — o `update` em `messages` continua
-- igual ao da 20260810162000.
create or replace function public.mark_conversation_read(conversation_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_participant(conversation_uuid) then
    raise exception 'Conversa nao autorizada';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = conversation_uuid
    and sender_id <> auth.uid()
    and read_at is null;

  -- Os avisos do sino, juntos. `auth.uid()` e não um parâmetro: quem lê é quem
  -- chama, e passar o usuário como argumento abriria a porta para marcar como
  -- lido o aviso de outra pessoa.
  --
  -- OS DOIS TIPOS que chegam pelo chat. Passaporte entra aqui porque abrir a
  -- conversa é ver o passaporte — ele aparece na própria conversa, como anexo da
  -- mensagem. Deixá-lo de fora prenderia o sino num número que só a tela de
  -- notificações zeraria, e quem abre a conversa direto nunca passa por ela.
  update public.notifications
  set read = true
  where user_id = auth.uid()
    and conversation_id = conversation_uuid
    and type in ('message', 'passport')
    and read = false;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

commit;
