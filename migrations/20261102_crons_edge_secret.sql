-- NO APLICADO. Crons de pg_cron que llaman a Edge Functions cerradas el 02/11/2026.
-- Paso previo (a mano, mismo valor en los dos sitios, NUNCA en este fichero):
--   1) select vault.create_secret('<VALOR_ALEATORIO_LARGO>', 'edge_cron_secret', 'x-cron-secret de pg_cron → Edge Functions (alerta-ritmo-cron, infra-monitor-cron, eventos-entorno)');
--   2) Edge Functions → Secrets: EDGE_CRON_SECRET = <mismo valor>
-- Después, ANTES de desplegar las funciones nuevas (la cabecera extra es inocua para las viejas):
select cron.alter_job(jobid, command := $cmd$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/alerta-ritmo-cron',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$cmd$) from cron.job where jobname = 'alerta-ritmo';

select cron.alter_job(jobid, command := $cmd$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/infra-monitor-cron',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$cmd$) from cron.job where jobname = 'infra-monitor';

select cron.alter_job(jobid, command := $cmd$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/eventos-entorno',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 30000)
$cmd$) from cron.job where jobname = 'eventos-entorno-diario';
-- Verificación: select jobname, command ilike '%edge_cron_secret%' from cron.job where jobname in ('alerta-ritmo','infra-monitor','eventos-entorno-diario');
-- y tras el despliegue, select status_code, count(*) from net._http_response where created > now() - interval '15 min' group by 1;  (sin 401)
