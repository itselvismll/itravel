-- Normalização de country_code: alpha-2 -> alpha-3.
--
-- O PROBLEMA
--
-- `country_photos`, `visited_countries` e `wishlist` guardam o código do país
-- ora em alpha-2 ('BR'), ora em alpha-3 ('BRA'). O app convive com isso desde
-- sempre: toda leitura compensa, buscando as duas formas (countryCodeVariants em
-- socialService, `possibleCodes` em photoService, `countryVariants` em
-- supabase.js). Por isso nada parecia quebrado.
--
-- Quebra na hora de AGREGAR. Um `group by country_code` conta a Argentina duas
-- vezes — uma como 'AR', outra como 'ARG' —, e qualquer ranking ("países em alta",
-- "mais visitados") sai com a contagem rachada.
--
-- A CAUSA, já corrigida no app
--
-- Os três pontos de escrita usavam `getAlpha3(x) || x.toUpperCase()`. Acontece
-- que `getAlpha3` NUNCA falha: a última linha dela é `return code.toUpperCase()`,
-- então `getAlpha3('XX')` devolve 'XX'. O código cru entrava no banco com cara de
-- normalizado. Agora os três passam por `toStorableCountryCode`, que devolve null
-- quando não reconhece — e aí a escrita é recusada com mensagem, em vez de gravar.
--
-- O QUE ESTA MIGRAÇÃO NÃO TOCA
--
-- 1. Códigos de 3 caracteres: já estão no formato certo.
-- 2. 'GB-ENG', 'GB-SCT', 'GB-WLS', 'GB-NIR' — as 4 nações do Reino Unido. Elas
--    são ISO 3166-2, têm 6 caracteres, e são países de primeira classe no app
--    (geometria, bandeira, conquista, badge). Convertê-las apagaria o recurso.
--    O `where length(country_code) = 2` já as exclui; o filtro explícito está
--    aqui como documentação de que a exclusão é deliberada.
-- 3. Alpha-2 que NÃO existe no mapa do app: fica como está, de propósito.
--    Inventar um alpha-3 para um código que o app não reconhece seria pior do que
--    deixar visível que aquela linha precisa de olho humano. A consulta de
--    conferência no fim do arquivo lista esses casos.
--
-- A TABELA DE CONVERSÃO abaixo foi GERADA a partir de ALPHA3_TO_ALPHA2
-- (src/utils/countryUtils.js), os mesmos 250 pares que o app usa. Não foi digitada
-- à mão, e não deve ser editada à mão: se o mapa do app mudar, regenere.
begin;

create temporary table alpha2_to_alpha3 (alpha2 text primary key, alpha3 text not null)
on commit drop;

insert into alpha2_to_alpha3 (alpha2, alpha3) values
  ('AD','AND'), ('AE','ARE'), ('AF','AFG'), ('AG','ATG'), ('AI','AIA'), ('AL','ALB'),
  ('AM','ARM'), ('AO','AGO'), ('AQ','ATA'), ('AR','ARG'), ('AS','ASM'), ('AT','AUT'),
  ('AU','AUS'), ('AW','ABW'), ('AX','ALA'), ('AZ','AZE'), ('BA','BIH'), ('BB','BRB'),
  ('BD','BGD'), ('BE','BEL'), ('BF','BFA'), ('BG','BGR'), ('BH','BHR'), ('BI','BDI'),
  ('BJ','BEN'), ('BL','BLM'), ('BM','BMU'), ('BN','BRN'), ('BO','BOL'), ('BQ','BES'),
  ('BR','BRA'), ('BS','BHS'), ('BT','BTN'), ('BV','BVT'), ('BW','BWA'), ('BY','BLR'),
  ('BZ','BLZ'), ('CA','CAN'), ('CC','CCK'), ('CD','COD'), ('CF','CAF'), ('CG','COG'),
  ('CH','CHE'), ('CI','CIV'), ('CK','COK'), ('CL','CHL'), ('CM','CMR'), ('CN','CHN'),
  ('CO','COL'), ('CR','CRI'), ('CU','CUB'), ('CV','CPV'), ('CW','CUW'), ('CX','CXR'),
  ('CY','CYP'), ('CZ','CZE'), ('DE','DEU'), ('DJ','DJI'), ('DK','DNK'), ('DM','DMA'),
  ('DO','DOM'), ('DZ','DZA'), ('EC','ECU'), ('EE','EST'), ('EG','EGY'), ('EH','ESH'),
  ('ER','ERI'), ('ES','ESP'), ('ET','ETH'), ('FI','FIN'), ('FJ','FJI'), ('FK','FLK'),
  ('FM','FSM'), ('FO','FRO'), ('FR','FRA'), ('GA','GAB'), ('GB','GBR'), ('GD','GRD'),
  ('GE','GEO'), ('GF','GUF'), ('GG','GGY'), ('GH','GHA'), ('GI','GIB'), ('GL','GRL'),
  ('GM','GMB'), ('GN','GIN'), ('GP','GLP'), ('GQ','GNQ'), ('GR','GRC'), ('GS','SGS'),
  ('GT','GTM'), ('GU','GUM'), ('GW','GNB'), ('GY','GUY'), ('HK','HKG'), ('HM','HMD'),
  ('HN','HND'), ('HR','HRV'), ('HT','HTI'), ('HU','HUN'), ('ID','IDN'), ('IE','IRL'),
  ('IL','ISR'), ('IM','IMN'), ('IN','IND'), ('IO','IOT'), ('IQ','IRQ'), ('IR','IRN'),
  ('IS','ISL'), ('IT','ITA'), ('JE','JEY'), ('JM','JAM'), ('JO','JOR'), ('JP','JPN'),
  ('KE','KEN'), ('KG','KGZ'), ('KH','KHM'), ('KI','KIR'), ('KM','COM'), ('KN','KNA'),
  ('KP','PRK'), ('KR','KOR'), ('KW','KWT'), ('KY','CYM'), ('KZ','KAZ'), ('LA','LAO'),
  ('LB','LBN'), ('LC','LCA'), ('LI','LIE'), ('LK','LKA'), ('LR','LBR'), ('LS','LSO'),
  ('LT','LTU'), ('LU','LUX'), ('LV','LVA'), ('LY','LBY'), ('MA','MAR'), ('MC','MCO'),
  ('MD','MDA'), ('ME','MNE'), ('MF','MAF'), ('MG','MDG'), ('MH','MHL'), ('MK','MKD'),
  ('ML','MLI'), ('MM','MMR'), ('MN','MNG'), ('MO','MAC'), ('MP','MNP'), ('MQ','MTQ'),
  ('MR','MRT'), ('MS','MSR'), ('MT','MLT'), ('MU','MUS'), ('MV','MDV'), ('MW','MWI'),
  ('MX','MEX'), ('MY','MYS'), ('MZ','MOZ'), ('NA','NAM'), ('NC','NCL'), ('NE','NER'),
  ('NF','NFK'), ('NG','NGA'), ('NI','NIC'), ('NL','NLD'), ('NO','NOR'), ('NP','NPL'),
  ('NR','NRU'), ('NU','NIU'), ('NZ','NZL'), ('OM','OMN'), ('PA','PAN'), ('PE','PER'),
  ('PF','PYF'), ('PG','PNG'), ('PH','PHL'), ('PK','PAK'), ('PL','POL'), ('PM','SPM'),
  ('PN','PCN'), ('PR','PRI'), ('PS','PSE'), ('PT','PRT'), ('PW','PLW'), ('PY','PRY'),
  ('QA','QAT'), ('RE','REU'), ('RO','ROU'), ('RS','SRB'), ('RU','RUS'), ('RW','RWA'),
  ('SA','SAU'), ('SB','SLB'), ('SC','SYC'), ('SD','SDN'), ('SE','SWE'), ('SG','SGP'),
  ('SH','SHN'), ('SI','SVN'), ('SJ','SJM'), ('SK','SVK'), ('SL','SLE'), ('SM','SMR'),
  ('SN','SEN'), ('SO','SOM'), ('SR','SUR'), ('SS','SSD'), ('ST','STP'), ('SV','SLV'),
  ('SX','SXM'), ('SY','SYR'), ('SZ','SWZ'), ('TC','TCA'), ('TD','TCD'), ('TF','ATF'),
  ('TG','TGO'), ('TH','THA'), ('TJ','TJK'), ('TK','TKL'), ('TL','TLS'), ('TM','TKM'),
  ('TN','TUN'), ('TO','TON'), ('TR','TUR'), ('TT','TTO'), ('TV','TUV'), ('TW','TWN'),
  ('TZ','TZA'), ('UA','UKR'), ('UG','UGA'), ('UM','UMI'), ('US','USA'), ('UY','URY'),
  ('UZ','UZB'), ('VA','VAT'), ('VC','VCT'), ('VE','VEN'), ('VG','VGB'), ('VI','VIR'),
  ('VN','VNM'), ('VU','VUT'), ('WF','WLF'), ('WS','WSM'), ('XK','KOS'), ('YE','YEM'),
  ('YT','MYT'), ('ZA','ZAF'), ('ZM','ZMB'), ('ZW','ZWE');

-- Contagem ANTES, em NOTICE: é o que faz a saída do `db push` dizer quantas
-- linhas a migração realmente tocou. Sem isto, o push só informa "aplicada" e
-- não haveria como conferir o número sem uma segunda ida ao banco.
do $$
declare
  fotos integer;
  visitados integer;
  desejos integer;
begin
  select count(*) into fotos from public.country_photos where length(country_code) = 2;
  select count(*) into visitados from public.visited_countries where length(country_code) = 2;
  select count(*) into desejos from public.wishlist where length(country_code) = 2;
  raise notice 'ANTES — alpha-2: country_photos=%, visited_countries=%, wishlist=%',
    fotos, visitados, desejos;
end $$;

-- ── country_photos ──────────────────────────────────────────────────────────
update public.country_photos as t
set country_code = m.alpha3
from alpha2_to_alpha3 as m
where length(t.country_code) = 2
  and upper(t.country_code) = m.alpha2;

-- ── visited_countries ───────────────────────────────────────────────────────
-- ON CONFLICT não se aplica a UPDATE: se o mesmo usuário tiver 'BR' e 'BRA'
-- gravados, o update violaria `visited_countries_user_id_country_code_key` e a
-- transação inteira falharia. Por isso as duplicatas saem ANTES, mantendo a
-- linha mais antiga (a que a pessoa criou primeiro).
delete from public.visited_countries as dup
using public.visited_countries as keep, alpha2_to_alpha3 as m
where length(dup.country_code) = 2
  and upper(dup.country_code) = m.alpha2
  and keep.user_id = dup.user_id
  and keep.country_code = m.alpha3
  and keep.id <> dup.id;

update public.visited_countries as t
set country_code = m.alpha3
from alpha2_to_alpha3 as m
where length(t.country_code) = 2
  and upper(t.country_code) = m.alpha2;

-- ── wishlist ────────────────────────────────────────────────────────────────
-- Mesma proteção: `wishlist_user_id_country_code_key` é único por (user, país).
delete from public.wishlist as dup
using public.wishlist as keep, alpha2_to_alpha3 as m
where length(dup.country_code) = 2
  and upper(dup.country_code) = m.alpha2
  and keep.user_id = dup.user_id
  and keep.country_code = m.alpha3
  and keep.id <> dup.id;

update public.wishlist as t
set country_code = m.alpha3
from alpha2_to_alpha3 as m
where length(t.country_code) = 2
  and upper(t.country_code) = m.alpha2;

-- Contagem DEPOIS. Os três precisam terminar em zero: se sobrar alpha-2, é
-- código que o mapa do app não conhece, e a migração o deixou de propósito para
-- alguém olhar (ver o cabeçalho). A migração não falha por isso — só avisa.
do $$
declare
  fotos integer;
  visitados integer;
  desejos integer;
  restante text;
begin
  select count(*) into fotos from public.country_photos where length(country_code) = 2;
  select count(*) into visitados from public.visited_countries where length(country_code) = 2;
  select count(*) into desejos from public.wishlist where length(country_code) = 2;
  raise notice 'DEPOIS — alpha-2 restante: country_photos=%, visited_countries=%, wishlist=%',
    fotos, visitados, desejos;

  if fotos + visitados + desejos > 0 then
    select string_agg(distinct country_code, ', ') into restante from (
      select country_code from public.country_photos where length(country_code) = 2
      union all select country_code from public.visited_countries where length(country_code) = 2
      union all select country_code from public.wishlist where length(country_code) = 2
    ) sobrou;
    raise notice 'ATENÇÃO — códigos alpha-2 não reconhecidos, deixados como estão: %', restante;
  end if;
end $$;

commit;
