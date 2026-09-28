-- Desactiva el briefing diario de ia.rest a Telegram (cron `nim-daily-briefing-9am`, 09:00).
-- Decisión de Alberto (28/09/2026): no hay restaurantes con actividad real (todo a 0 comandas) y el
-- aviso no pasa por el panel /telegram de plataforma, así que no se podía silenciar desde allí.
-- Se PAUSA (active=false), no se borra: reactivar = `cron.alter_job(<jobid>, active := true)`.
-- Aplicado ya en BD el 28/09/2026 (jobid 21).
SELECT cron.alter_job(jobid, active := false)
FROM cron.job WHERE jobname = 'nim-daily-briefing-9am';
