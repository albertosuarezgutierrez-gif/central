-- Fix de update_experiment_results() — pipeline de resultados de pricing_experiments.
--
-- Problema: la versión anterior referenciaba incomes.property_id y incomes.total_price,
-- columnas inexistentes (la tabla usa "propertyId" y amount/amount_gross). La función
-- fallaba en CADA ejecución del cron check-results, por lo que ningún experimento se
-- cerraba (was_booked/result_checked_at quedaban en NULL indefinidamente).
--
-- Solución: derivar el resultado de la señal noche-a-noche de rate_snapshots.was_booked
-- (el último snapshot de esa propiedad+fecha), que ya captura noches de mitad de estancia
-- y evita el frágil match incomes.checkIn = rate_date.
--
-- Aplicada a mano en Supabase (wswbehlcuxqxyinousql) el 2026-06-22. Idempotente y
-- re-ejecutable: SELECT update_experiment_results();

CREATE OR REPLACE FUNCTION public.update_experiment_results()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Cierra experimentos de fechas pasadas con el último snapshot de esa
  -- propiedad+fecha que tenga señal de reserva.
  UPDATE pricing_experiments pe
  SET
    was_booked        = sub.booked,
    revenue_realized  = CASE WHEN sub.booked THEN pe.price_set ELSE 0 END,
    result_checked_at = now()
  FROM (
    SELECT DISTINCT ON (rs.property_id, rs.rate_date)
      rs.property_id, rs.rate_date, rs.was_booked AS booked
    FROM rate_snapshots rs
    WHERE rs.was_booked IS NOT NULL
    ORDER BY rs.property_id, rs.rate_date, rs.snapshot_date DESC
  ) sub
  WHERE pe.property_id = sub.property_id
    AND pe.rate_date   = sub.rate_date
    AND pe.rate_date   < CURRENT_DATE
    AND pe.was_booked IS NULL;

  -- Fallback: fecha pasada sin snapshot con señal -> se considera libre.
  UPDATE pricing_experiments
  SET was_booked = false, result_checked_at = now()
  WHERE rate_date < CURRENT_DATE
    AND was_booked IS NULL;
END;
$function$;
