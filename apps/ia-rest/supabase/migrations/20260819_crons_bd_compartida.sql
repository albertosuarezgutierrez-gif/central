-- ia.rest · Recreación de los cron jobs en la BD COMPARTIDA (wswbehlcuxqxyinousql)
--
-- Contexto (19/08/2026, cierre de la unificación Supabase): la migración de junio (Fase A2)
-- movió esquema + Edge Functions al proyecto compartido, pero los 25 cron jobs de pg_cron
-- se quedaron SIN recrear — seguían corriendo en el proyecto viejo (efncqyvhniaxsirhdxaa)
-- contra datos muertos. Esta migración los recrea todos apuntando a iarest.* y a las
-- Edge Functions del compartido.
--
-- Cambios respecto a los jobs del viejo:
--   · Todo cualificado a `iarest.` (en el viejo vivían en `public`).
--   · URLs de functions → https://wswbehlcuxqxyinousql.supabase.co/functions/v1/…
--   · Sin JWTs cableados: monitor-health (único verify_jwt=true invocado por cron) usa
--     current_setting('app.service_role_key') y NO llama si la setting no está configurada
--     (la configura Alberto: ALTER DATABASE postgres SET app.service_role_key = '<service_role>').
--   · super-training-monitor: el original filtraba por alerta_log.tipo/created_at, columnas
--     que NO existen (fallaba en silencio también en el viejo). Adaptado a
--     trigger_tipos @> ARRAY[...] y disparada_at, que es donde escribe fn_alerta_super.
--   · limpiar-mesas-fantasma: versión 12/08 (corte de fantasmas con items a las 24 h).
--   · Retención (purge_old_cron_history / purge_old_alerta_log): el script 20260812 se
--     aplicó al proyecto viejo; aquí se crean las funciones en iarest.

-- ---------------------------------------------------------------------------
-- 0. Funciones de retención que faltaban en iarest (del script 20260812)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION iarest.purge_old_cron_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'iarest, cron'
AS $$
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days';
$$;

CREATE OR REPLACE FUNCTION iarest.purge_old_alerta_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'iarest'
AS $$
  DELETE FROM iarest.alerta_log WHERE disparada_at < now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------
-- 1. Idempotencia: des-programar si ya existieran
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname IN (
  'ia-rest-purge-transcripciones','ia-rest-purge-auth-attempts','ia-rest-purge-security-log',
  'check-ia-hitos-diario','billing-consumo-diario','billing-reset-mensual','billing-trial-warning',
  'trial-expiry-check','limpiar-fuera-carta','fuera-carta-cleanup','purge-mensajes-turno-5d',
  'purge-cron-history','purge-alerta-log','limpiar-mesas-fantasma','super-training-monitor',
  'super-nuevos-clientes','super-trial-expira','alerta-ritmo','infra-monitor',
  'nim-daily-briefing-9am','nim-sentiment-2am','nim-diagnostico-10min','eventos-entorno-diario',
  'check-elaboraciones-caducidad','monitor-health-cron'
);

-- ---------------------------------------------------------------------------
-- 2. SQL directo (purgas, billing, limpiezas)
-- ---------------------------------------------------------------------------
SELECT cron.schedule('ia-rest-purge-transcripciones', '0 3 * * *',  'SELECT iarest.purge_old_transcripciones()');
SELECT cron.schedule('ia-rest-purge-auth-attempts',   '0 * * * *',  'SELECT iarest.purge_old_auth_attempts()');
SELECT cron.schedule('ia-rest-purge-security-log',    '0 4 * * 0',  'SELECT iarest.purge_old_security_log()');
SELECT cron.schedule('check-ia-hitos-diario',         '0 8 * * *',  'SELECT iarest.fn_check_ia_hitos()');
SELECT cron.schedule('billing-consumo-diario',        '0 3 * * *',  'SELECT iarest.recalcular_consumo_mensual(id) FROM iarest.restaurantes WHERE activo = true; SELECT iarest.fn_generar_alertas_consumo();');
SELECT cron.schedule('billing-reset-mensual',         '5 0 1 * *',  'UPDATE iarest.restaurantes SET comandas_mes_actual = 0, camareros_activos_mes = 0 WHERE activo = true');
SELECT cron.schedule('trial-expiry-check',            '0 9 * * *',  'SELECT iarest.fn_avisos_trial()');
SELECT cron.schedule('limpiar-fuera-carta',           '0 * * * *',  'SELECT iarest.fn_limpiar_fuera_carta()');
SELECT cron.schedule('fuera-carta-cleanup',           '5 0 * * *',  'UPDATE iarest.productos SET activo = false WHERE es_fuera_carta = true AND activo = true AND expira_at IS NOT NULL AND expira_at < now();');
SELECT cron.schedule('purge-mensajes-turno-5d',       '0 3 * * *',  'DELETE FROM iarest.mensajes_turno WHERE created_at < now() - interval ''5 days'';');
SELECT cron.schedule('purge-cron-history',            '15 3 * * *', 'SELECT iarest.purge_old_cron_history()');
SELECT cron.schedule('purge-alerta-log',              '25 3 * * *', 'SELECT iarest.purge_old_alerta_log()');

SELECT cron.schedule('billing-trial-warning', '0 8 * * *', $cmd_trial$
  INSERT INTO iarest.alerta_log (local_id, trigger_tipos, mensaje_voz, leida)
  SELECT id, ARRAY['trial_expira'],
    'Tu prueba gratuita de ia.rest expira en ' ||
    GREATEST(0, EXTRACT(DAY FROM (billing_trial_fin - now()))::int) ||
    ' días. Activa tu suscripción para seguir sin interrupciones.',
    false
  FROM iarest.restaurantes
  WHERE billing_estado = 'trial'
    AND billing_trial_fin BETWEEN now() AND now() + interval '3 days'
    AND activo = true
$cmd_trial$);

SELECT cron.schedule('limpiar-mesas-fantasma', '*/10 * * * *', $cmd_fantasma$
  -- (a) comandas sin ningún item: se cierran de inmediato
  UPDATE iarest.comandas
  SET estado = 'cerrada', updated_at = NOW()
  WHERE estado IN ('nueva', 'en_curso', 'lista')
    AND id NOT IN (
      SELECT DISTINCT comanda_id FROM iarest.comanda_items WHERE comanda_id IS NOT NULL
    );

  -- (b) comandas con items pero abandonadas hace más de 24 h: fantasmas
  UPDATE iarest.comandas
  SET estado = 'cerrada', updated_at = NOW()
  WHERE estado IN ('nueva', 'en_curso', 'lista')
    AND created_at < NOW() - interval '24 hours';

  -- (c) libera toda mesa que ya no tenga ninguna comanda viva
  UPDATE iarest.mesas
  SET estado = 'libre', updated_at = NOW()
  WHERE estado != 'libre'
    AND id NOT IN (
      SELECT DISTINCT mesa_id FROM iarest.comandas
      WHERE estado IN ('nueva', 'en_curso', 'lista')
        AND mesa_id IS NOT NULL
    );
$cmd_fantasma$);

-- ---------------------------------------------------------------------------
-- 3. Vigilancias del super (DO blocks)
-- ---------------------------------------------------------------------------
SELECT cron.schedule('super-training-monitor', '0 9 * * *', $cmd_training$
  DO $inner$
  DECLARE
    v_count_real int;
  BEGIN
    SELECT COUNT(*) INTO v_count_real
    FROM iarest.ia_training_log
    WHERE fuente = 'claude_api' AND calidad >= 4;

    -- Umbral 500 pares reales
    IF v_count_real >= 500 AND NOT EXISTS (
      SELECT 1 FROM iarest.alerta_log
      WHERE trigger_tipos @> ARRAY['training_500']
      AND disparada_at > now() - interval '30 days'
    ) THEN
      PERFORM iarest.fn_alerta_super(
        'training_500',
        '🧠 ia.rest aprende: ' || v_count_real || ' pares reales en ia_training_log. Ya puedes hacer una primera prueba del modelo propio.'
      );
    END IF;

    -- Umbral 2000 pares reales → listo para entrenar
    IF v_count_real >= 2000 AND NOT EXISTS (
      SELECT 1 FROM iarest.alerta_log
      WHERE trigger_tipos @> ARRAY['training_listo']
      AND disparada_at > now() - interval '30 days'
    ) THEN
      PERFORM iarest.fn_alerta_super(
        'training_listo',
        '🚀 MODELO PROPIO LISTO: ' || v_count_real || ' pares de calidad en ia_training_log. Es el momento de entrenar y activar el modelo propio.'
      );
    END IF;
  END;
  $inner$;
$cmd_training$);

SELECT cron.schedule('super-nuevos-clientes', '0 * * * *', $cmd_nuevos$
  DO $inner$
  DECLARE
    rec RECORD;
  BEGIN
    FOR rec IN
      SELECT nombre, billing_estado, created_at
      FROM iarest.restaurantes
      WHERE created_at > now() - interval '1 hour'
        AND id != '00000000-0000-0000-0000-000000000001'
    LOOP
      PERFORM iarest.fn_alerta_super(
        'nuevo_cliente',
        '🎉 Nuevo restaurante registrado: ' || rec.nombre ||
        ' (' || rec.billing_estado || ') · ' ||
        TO_CHAR(rec.created_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
      );
    END LOOP;
  END;
  $inner$;
$cmd_nuevos$);

SELECT cron.schedule('super-trial-expira', '30 8 * * *', $cmd_expira$
  DO $inner$
  DECLARE
    rec RECORD;
    v_dias int;
  BEGIN
    FOR rec IN
      SELECT nombre, billing_trial_fin
      FROM iarest.restaurantes
      WHERE billing_estado = 'trial'
        AND billing_trial_fin BETWEEN now() AND now() + interval '3 days'
        AND id != '00000000-0000-0000-0000-000000000001'
    LOOP
      v_dias := GREATEST(0, EXTRACT(DAY FROM (rec.billing_trial_fin - now()))::int);
      PERFORM iarest.fn_alerta_super(
        'trial_expira_owner',
        '⏰ Trial expira en ' || v_dias || ' días: ' || rec.nombre ||
        '. Contactar para convertir a suscripción.'
      );
    END LOOP;
  END;
  $inner$;
$cmd_expira$);

-- ---------------------------------------------------------------------------
-- 4. Invocación de Edge Functions (verify_jwt=false → sin Authorization)
-- ---------------------------------------------------------------------------
SELECT cron.schedule('alerta-ritmo', '*/2 * * * *', $cmd_ritmo$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/alerta-ritmo-cron',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$cmd_ritmo$);

SELECT cron.schedule('infra-monitor', '*/5 * * * *', $cmd_infra$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/infra-monitor-cron',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$cmd_infra$);

SELECT cron.schedule('nim-daily-briefing-9am', '0 7 * * *', $cmd_brief$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/daily-briefing',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$cmd_brief$);

SELECT cron.schedule('nim-sentiment-2am', '0 2 * * *', $cmd_sent$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/nim-sentiment',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$cmd_sent$);

SELECT cron.schedule('nim-diagnostico-10min', '*/10 * * * *', $cmd_diag$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/nim-diagnostico',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$cmd_diag$);

SELECT cron.schedule('eventos-entorno-diario', '0 6 * * *', $cmd_entorno$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/eventos-entorno',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$cmd_entorno$);

SELECT cron.schedule('check-elaboraciones-caducidad', '0 * * * *', $cmd_elab$
  SELECT net.http_post(
    url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/check-elaboraciones',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
$cmd_elab$);

-- ---------------------------------------------------------------------------
-- 5. monitor-health (verify_jwt=true): solo llama si app.service_role_key está
--    configurada a nivel de BD. Sin JWT cableado en el comando.
-- ---------------------------------------------------------------------------
SELECT cron.schedule('monitor-health-cron', '*/5 * * * *', $cmd_health$
  DO $inner$
  BEGIN
    IF coalesce(current_setting('app.service_role_key', true), '') <> '' THEN
      PERFORM net.http_post(
        url := 'https://wswbehlcuxqxyinousql.supabase.co/functions/v1/monitor-health',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
        ),
        body := '{}'::jsonb
      );
    END IF;
  END;
  $inner$;
$cmd_health$);
