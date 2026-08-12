-- ia.rest · Retención de logs de infraestructura + corte del bucle de alertas
--
-- Contexto (12/08/2026): la BD del silo ia-rest había crecido a 290 MB, de los que
-- 252 MB eran logs de infraestructura y espacio muerto, no datos de producto:
--   · net._http_response       123 MB con 368 filas vivas  → bloat: pg_net purga las
--     filas pero el espacio nunca vuelve al SO sin un VACUUM FULL.
--   · cron.job_run_details      98 MB / 157.998 filas desde el 04/05 → pg_cron NO
--     purga esta tabla por defecto y nadie le había puesto retención.
--   · public.alerta_log         31 MB / 51.559 filas, el 100% del "Restaurante Demo".
--
-- El VACUUM FULL de las tres tablas se aplicó a mano (290 MB → 60 MB). Esta migración
-- deja la retención automática para que no vuelva a acumularse, y corta el goteo de
-- alerta_log en su origen.

-- ---------------------------------------------------------------------------
-- 1. Retención del historial de pg_cron (7 días)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER porque cron.job_run_details es propiedad de postgres.
CREATE OR REPLACE FUNCTION public.purge_old_cron_history()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public, cron'
AS $$
  DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days';
$$;

-- ---------------------------------------------------------------------------
-- 2. Retención del log de alertas (30 días)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_alerta_log()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  DELETE FROM public.alerta_log WHERE disparada_at < now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------
-- 3. Programación diaria de ambas purgas (de madrugada, fuera de servicio)
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('purge-cron-history')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cron-history');
SELECT cron.unschedule('purge-alerta-log')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-alerta-log');

SELECT cron.schedule('purge-cron-history', '15 3 * * *', 'SELECT public.purge_old_cron_history()');
SELECT cron.schedule('purge-alerta-log',   '25 3 * * *', 'SELECT public.purge_old_alerta_log()');

-- ---------------------------------------------------------------------------
-- 4. Corte del bucle en su origen: mesas fantasma con comanda viva
-- ---------------------------------------------------------------------------
-- El cron `limpiar-mesas-fantasma` solo cerraba comandas SIN items, así que tres
-- comandas demo con items (mesas B1, S2 y T5) llevaban abiertas desde el 21 y el
-- 27/05: 77 días con la mesa en 'activa'. `alerta-ritmo` (*/2 min, dedup de 15 min
-- por regla+mesa) las re-alertaba indefinidamente → 1.170 alertas/día EXACTAS, cero
-- leídas y cero actuadas.
--
-- Se añade un corte por antigüedad: ninguna comanda de hostelería sigue viva 24 h
-- después de abrirse. Al cerrarla, el UPDATE de mesas que ya existía libera la mesa.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'limpiar-mesas-fantasma'),
  command => $cmd$
    -- (a) comandas sin ningún item: se cierran de inmediato (comportamiento previo)
    UPDATE comandas
    SET estado = 'cerrada', updated_at = NOW()
    WHERE estado IN ('nueva', 'en_curso', 'lista')
      AND id NOT IN (
        SELECT DISTINCT comanda_id FROM comanda_items WHERE comanda_id IS NOT NULL
      );

    -- (b) comandas con items pero abandonadas hace más de 24 h: fantasmas
    UPDATE comandas
    SET estado = 'cerrada', updated_at = NOW()
    WHERE estado IN ('nueva', 'en_curso', 'lista')
      AND created_at < NOW() - interval '24 hours';

    -- (c) libera toda mesa que ya no tenga ninguna comanda viva
    UPDATE mesas
    SET estado = 'libre', updated_at = NOW()
    WHERE estado != 'libre'
      AND id NOT IN (
        SELECT DISTINCT mesa_id FROM comandas
        WHERE estado IN ('nueva', 'en_curso', 'lista')
          AND mesa_id IS NOT NULL
      );
  $cmd$
);
