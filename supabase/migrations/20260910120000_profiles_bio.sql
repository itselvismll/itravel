-- Coluna `bio` de public.profiles: criação + limite de 160 caracteres.
--
-- POR QUE ESTA MIGRAÇÃO CRIA A COLUNA, E NÃO SÓ O CONSTRAINT
--
-- A `bio` NUNCA EXISTIU. Ela é citada no INSERT de duas migrações antigas
-- (20260721120000_create_profiles_on_signup e 20260821120000_onboarding_completed),
-- e é fácil ler isso como prova de que a coluna existe — mas o que aquelas
-- citações causaram foi um bug: a 20260823120000_fix_handle_new_user_columns
-- existe exatamente para removê-las, e o comentário dela diz com todas as
-- letras que `full_name` e `bio` "não existem em public.profiles". O sintoma na
-- época foi o trigger de cadastro quebrando com 42703 (undefined_column) e todo
-- signup novo falhando com "Database error saving new user".
--
-- Nenhuma migração jamais executou um `add column bio`. Confirmado também pela
-- API do projeto remoto, que respondeu 42703 / "column profiles.bio does not
-- exist" para `select=bio` — erro do POSTGRES, e não o PGRST204 de cache
-- desatualizado do PostgREST.
--
-- O LIMITE
--
-- 160 caracteres, o mesmo de BIO_MAX_LENGTH em src/utils/bio.js. Mudou lá, muda
-- aqui — como já acontece entre utils/username.js e public.normalize_username().
--
-- `char_length` e não `length`: em text os dois coincidem, mas char_length diz
-- explicitamente que a contagem é de CARACTERES, e não de bytes. Um emoji é 4
-- bytes e um caractere; contar bytes recusaria bio legítima cheia de emoji.
--
-- ATENÇÃO À DIFERENÇA DE CONTAGEM COM O APP: o app conta code points (o spread
-- de string, para o contador da tela bater com o que a pessoa vê), e o Postgres
-- conta o mesmo para a esmagadora maioria dos casos. Emoji com modificador
-- (bandeiras, famílias com ZWJ) contam mais de um dos dois lados igualmente,
-- então o app barra antes do banco. O constraint aqui é a rede de segurança
-- para quem não passa pela tela, não a régua principal.
begin;

-- Idempotente: se a coluna já tiver sido criada à mão em algum ambiente, esta
-- migração não pode quebrar ao rodar lá.
alter table public.profiles
  add column if not exists bio text;

-- O constraint é recriado do zero para a migração poder rodar de novo sem erro
-- e para ficar com a definição atual, caso ela mude no futuro.
alter table public.profiles
  drop constraint if exists profiles_bio_length_check;

-- NOT VALID de propósito: se algum ambiente já tiver uma bio acima de 160
-- caracteres gravada à mão, um constraint validado na hora faria a migração
-- inteira falhar. Assim ele passa a valer para toda escrita nova imediatamente,
-- e as linhas antigas são conferidas no VALIDATE logo abaixo — que só pega um
-- lock fraco e não bloqueia leitura nem escrita.
alter table public.profiles
  add constraint profiles_bio_length_check
  check (bio is null or char_length(bio) <= 160)
  not valid;

alter table public.profiles
  validate constraint profiles_bio_length_check;

-- Sem alterar handle_new_user(): a 20260823120000 deixou o trigger inserindo só
-- as colunas indispensáveis, de propósito, "o que torna o cadastro imune a esse
-- tipo de regressão". A bio nasce null e é preenchida depois, na edição de
-- perfil — devolvê-la ao trigger reabriria a porta do bug que aquela migração
-- fechou.

-- Faz o PostgREST recarregar o schema na hora.
--
-- Sem isto, o primeiro UPDATE com `bio` responde
--   PGRST204: "Could not find the 'bio' column of 'profiles' in the schema cache"
-- mesmo com a coluna já criada — a coluna existe no banco, mas não no cache que
-- o PostgREST mantém em memória. O Supabase tem um event trigger que recarrega
-- sozinho, só que ele leva alguns segundos; este NOTIFY tira a janela em que o
-- app parece continuar quebrado depois de a migração ter passado.
notify pgrst, 'reload schema';

commit;
