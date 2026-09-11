-- Job diário que dispara a limpeza das contas vencidas.
--
-- ⚠️ NÃO APLICADA. Exige um passo manual antes — ver "PRÉ-REQUISITOS".
--
-- POR QUE O CRON CHAMA UMA EDGE FUNCTION, E NÃO `purge_expired_accounts()`
--
-- A limpeza tem duas metades: as linhas no banco e os ARQUIVOS no Storage
-- (buckets `avatars` e `country-photos`). SQL não alcança bucket. Se o cron
-- chamasse a função SQL direto, as linhas sumiriam e as fotos ficariam órfãs
-- para sempre — e a Política de Privacidade promete que as fotos são apagadas.
--
-- Então: cron -> HTTP -> Edge Function `purge-accounts` -> chama
-- `purge_expired_accounts()` no banco, recebe os caminhos e apaga os arquivos.
--
-- PRÉ-REQUISITOS (uma vez, fora desta migração)
--
--   1. Extensões `pg_cron` e `pg_net` habilitadas no projeto
--      (Dashboard -> Database -> Extensions). O `create extension` abaixo tenta
--      habilitar, mas em alguns projetos isso exige privilégio de owner.
--
--   2. Um segredo no Vault com o nome `purge_accounts_secret`, que a Edge
--      Function compara com o header recebido:
--
--        select vault.create_secret('<valor-aleatorio-longo>', 'purge_accounts_secret');
--
--      O MESMO valor precisa estar em `PURGE_ACCOUNTS_SECRET` nos secrets da
--      Edge Function:
--
--        supabase secrets set PURGE_ACCOUNTS_SECRET=<mesmo-valor>
--
--      O segredo não está neste arquivo de propósito: migração vai para o git.
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove uma versão anterior do job antes de recriar, para a migração poder
-- rodar de novo sem duplicar o agendamento.
select cron.unschedule('journi-purge-expired-accounts')
where exists (
  select 1 from cron.job where jobname = 'journi-purge-expired-accounts'
);

-- 0 6 * * * UTC = 03:00 no horário de Brasília, o vale de tráfego do app.
--
-- A granularidade diária significa que a limpeza ocorre entre 5 e 6 dias após o
-- pedido, nunca antes dos 5 — a Política diz "após 5 dias", o que comporta isso.
select cron.schedule(
  'journi-purge-expired-accounts',
  '0 6 * * *',
  $cron$
  select net.http_post(
    url     := 'https://qenehyizxesmaeylmcjv.supabase.co/functions/v1/purge-accounts',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-purge-secret', (
                   select decrypted_secret
                     from vault.decrypted_secrets
                    where name = 'purge_accounts_secret'
                 )
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

commit;
