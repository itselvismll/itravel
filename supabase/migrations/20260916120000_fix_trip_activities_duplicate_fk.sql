-- Correção: "Minhas viagens" ficou vazia depois da Fase 0.
--
-- O QUE ACONTECEU
--
-- 20260915130000 criou `trip_activities` com DUAS chaves estrangeiras dizendo a
-- mesma coisa:
--
--   day_id uuid not null references public.trip_days (id)            -- inline
--   foreign key (day_id, trip_id) references public.trip_days (id, trip_id)
--
-- A intenção era só a composta (é ela que impede uma atividade de apontar para
-- um dia de OUTRA viagem). A inline ficou por descuido, e para o banco as duas
-- são relacionamentos válidos e distintos entre as mesmas tabelas.
--
-- O PostgREST então não sabe por qual delas fazer o join, e recusa a consulta
-- inteira com PGRST201 ("Could not embed because more than one relationship was
-- found for 'trip_days' and 'trip_activities'"), HTTP 300. Como a tela de
-- roteiros salvos trata erro de consulta como "nenhum roteiro", o efeito na
-- prática foi: todas as viagens sumiram da lista, sem mensagem nenhuma.
--
-- Nada foi perdido: o dado estava lá o tempo todo, a RLS estava correta e o
-- backfill de trip_members também. O que quebrou foi a LEITURA.
--
-- A correção é apagar a chave redundante. A composta continua garantindo tudo o
-- que a inline garantia — que o dia existe — e mais: que ele é da mesma viagem.
-- O `on delete cascade` também é dela, então apagar um dia continua levando as
-- atividades junto.

begin;

alter table public.trip_activities
  drop constraint if exists trip_activities_day_id_fkey;

comment on constraint trip_activities_day_id_trip_id_fkey on public.trip_activities is
  'Única FK entre trip_activities e trip_days, de propósito: duas fariam o PostgREST recusar o embed por ambiguidade (PGRST201).';

-- O PostgREST guarda o mapa de relacionamentos em cache. Sem este aviso, ele
-- continuaria recusando a consulta até o próximo reload automático.
notify pgrst, 'reload schema';

commit;
