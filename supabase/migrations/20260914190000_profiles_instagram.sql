-- Coluna `instagram_username` de public.profiles: o @ do Instagram do viajante.
--
-- Opcional por definição do produto: perfil sem ela simplesmente não mostra o
-- badge. Por isso é `null`, e não `''` — "não informado" é ausência de valor, e
-- guardar string vazia criaria dois jeitos de dizer a mesma coisa, que as telas
-- teriam de testar separadamente para sempre.
--
-- O FORMATO
--
-- Letras, números, ponto e underline, até 30 caracteres: é a regra do próprio
-- Instagram, e é a MESMA de normalizeInstagramUsername() em src/utils/instagram.js.
-- Mudou lá, muda aqui — a mesma dupla que já existe entre utils/username.js e
-- public.normalize_username().
--
-- O constraint é rede de segurança, não a régua principal: quem passa pela tela
-- de edição já chega aqui normalizado (sem @, sem a URL colada do navegador).
-- Ele existe para quem escreve direto pelo PostgREST, e porque um valor sujo
-- aqui vira um deep link quebrado (`instagram://user?username=https://...`) que
-- ninguém descobre até tocar no badge.
--
-- SEM UNIQUE, DE PROPÓSITO
--
-- Duas contas do Journi podem legitimamente apontar para o mesmo Instagram (uma
-- pessoa com perfil pessoal e de viagem, um casal que divide a conta). Um índice
-- único transformaria isso em erro de gravação numa tela de edição de perfil,
-- sem nada para o usuário fazer a respeito. Não é identidade, é um link.
begin;

-- Idempotente, como a migração da bio: se a coluna já tiver sido criada à mão em
-- algum ambiente, rodar isto lá não pode quebrar.
alter table public.profiles
  add column if not exists instagram_username text;

comment on column public.profiles.instagram_username is
  'O @ do Instagram, SEM o arroba. Nulo quando não informado. Formato validado por profiles_instagram_username_check.';

-- `not valid` + `validate` em dois passos, igual à bio: o ALTER não varre a
-- tabela inteira segurando lock de escrita, e a validação acontece depois.
alter table public.profiles
  drop constraint if exists profiles_instagram_username_check;

alter table public.profiles
  add constraint profiles_instagram_username_check
  check (
    instagram_username is null
    or instagram_username ~ '^[A-Za-z0-9._]{1,30}$'
  )
  not valid;

alter table public.profiles
  validate constraint profiles_instagram_username_check;

-- Sem tocar em handle_new_user(): a 20260823120000 deixou o trigger inserindo só
-- as colunas indispensáveis justamente para o cadastro ficar imune a este tipo
-- de regressão. O campo nasce null e é preenchido na edição de perfil.

-- Faz o PostgREST recarregar o schema na hora; sem isto o primeiro UPDATE com
-- `instagram_username` responde PGRST204 mesmo com a coluna já criada.
notify pgrst, 'reload schema';

commit;
