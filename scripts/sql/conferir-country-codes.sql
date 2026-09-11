-- CONFERÊNCIA — só leitura, não altera nada.
--
-- Rode no SQL Editor do Supabase ANTES de aplicar
-- supabase/migrations/20260911120000_normalize_country_codes.sql.
--
-- A tabela de conversão é a mesma da migração, gerada de ALPHA3_TO_ALPHA2
-- (src/utils/countryUtils.js).

with alpha2_to_alpha3 (alpha2, alpha3) as (values
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
  ('YT','MYT'), ('ZA','ZAF'), ('ZM','ZMB'), ('ZW','ZWE')
),
linhas as (
  select 'country_photos' as tabela, id::text, country_code from public.country_photos
  union all select 'visited_countries', id::text, country_code from public.visited_countries
  union all select 'wishlist', id::text, country_code from public.wishlist
)

-- (1) PANORAMA: quantas linhas em cada formato, por tabela.
select
  l.tabela,
  case
    when length(l.country_code) = 3 then 'alpha-3 (ok)'
    when l.country_code in ('GB-ENG','GB-SCT','GB-WLS','GB-NIR') then 'nação do Reino Unido (ok, não mexer)'
    when length(l.country_code) = 2 and m.alpha3 is not null then 'alpha-2 CONVERSÍVEL'
    when length(l.country_code) = 2 then 'alpha-2 DESCONHECIDO (precisa de olho humano)'
    else 'outro formato (precisa de olho humano)'
  end as situacao,
  count(*) as linhas
from linhas l
left join alpha2_to_alpha3 m on upper(l.country_code) = m.alpha2
group by 1, 2
order by 1, 3 desc;

-- (2) A LISTA EXATA do que o UPDATE mudaria: de -> para.
--     Rode este bloco separado, trocando o SELECT acima por este.
--
-- select l.tabela, l.id, l.country_code as de, m.alpha3 as para
-- from linhas l
-- join alpha2_to_alpha3 m on upper(l.country_code) = m.alpha2
-- where length(l.country_code) = 2
-- order by l.tabela, l.country_code;

-- (3) DUPLICATAS que a migração vai apagar: o mesmo usuário com 'BR' e 'BRA'.
--     Sem isso o UPDATE violaria o índice único e derrubaria a transação.
--
-- select 'visited_countries' as tabela, v2.user_id, v2.country_code as alpha2, v3.country_code as alpha3
-- from public.visited_countries v2
-- join alpha2_to_alpha3 m on upper(v2.country_code) = m.alpha2
-- join public.visited_countries v3 on v3.user_id = v2.user_id and v3.country_code = m.alpha3
-- where length(v2.country_code) = 2
-- union all
-- select 'wishlist', w2.user_id, w2.country_code, w3.country_code
-- from public.wishlist w2
-- join alpha2_to_alpha3 m on upper(w2.country_code) = m.alpha2
-- join public.wishlist w3 on w3.user_id = w2.user_id and w3.country_code = m.alpha3
-- where length(w2.country_code) = 2;
