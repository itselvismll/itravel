-- Marca se o usuario ja escolheu (ou confirmou) o proprio username.
--
-- Quem entra pelo Google nao escolhe username: o trigger deriva um do nome do
-- provedor. Essa coluna e o que faz o app pedir a confirmacao uma unica vez,
-- antes do onboarding de boas-vindas.
--
-- Nao da para detectar isso pelo formato do username: depois de
-- 20260824140000 o auto-gerado ("matheuslim") e indistinguivel de um username
-- escolhido a mao. Por isso uma coluna explicita, e nao heuristica.
--
-- De proposito, `handle_new_user` NAO cita esta coluna: contas novas pegam o
-- default `false` e o app grava `true` ao fim do cadastro por formulario. Foi
-- exatamente o acoplamento do trigger a uma coluna nova que derrubou todo o
-- cadastro em 21/08 (migracao 20260821120000, revertida em 20260823120000).
begin;

alter table public.profiles
  add column if not exists username_confirmed boolean not null default false;

comment on column public.profiles.username_confirmed is
  'true quando o usuario escolheu/confirmou o proprio username. Contas via Google nascem false e passam pela ChooseUsernameScreen.';

-- Backfill: toda conta que ja existe fica confirmada. Sem isso, o app pediria
-- username para a base inteira no proximo login.
update public.profiles
set username_confirmed = true
where username_confirmed = false;

commit;
