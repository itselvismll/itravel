-- Indice para a futura consulta do globo 3D sobre os pontos do roteiro.
--
-- As coordenadas, o dia, a ordem e a categoria de cada lugar vivem dentro de
-- travel_plans.plan_data (jsonb) -> days[] -> activities[]. Nenhuma coluna nova e
-- necessaria; o que falta e poder consultar esse conteudo sem varrer a tabela.
--
-- jsonb_path_ops (em vez do GIN padrao) e menor e mais rapido para o unico operador que
-- a plotagem usa: contencao (@>). Ex.: planos com pelo menos um ponto de gastronomia:
--   select id from public.travel_plans
--   where plan_data @> '{"days":[{"activities":[{"category":"restaurante"}]}]}';

begin;

create index if not exists travel_plans_plan_data_gin_idx
  on public.travel_plans using gin (plan_data jsonb_path_ops);

commit;
