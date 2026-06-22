-- Fix de update_experiment_results() — pipeline de resultados de pricing_experiments.
--
-- Problema original: la función referenciaba incomes.property_id / incomes.total_price
-- (columnas inexistentes: son "propertyId" y amount/amount_gross). Fallaba en CADA
-- ejecución del cron check-results, por lo que ningún experimento se cerraba
-- (was_booked/result_checked_at quedaban en NULL indefinidamente).
--
-- Solución:
--  * was_booked: de la señal noche-a-noche de rate_snapshots.was_booked (la calcula
--    update_rate_snapshots_booked() con el span correcto checkIn <= noche < checkOut,
--    captando noches de mitad de estancia).
--  * revenue_realized: ADR BRUTO REAL del income que cubre esa noche, para que el
--    "reservado ≥ PL" sea de fiar (se puede comprobar si la reserva entró a nuestro
--    precio: revenue_realized ~ price_set; y el margen real vs PriceLabs:
--    revenue_realized vs pe.price_pricelabs, baseline guardado al crear el experimento).
--      - noches = checkOut::date - checkIn::date  (la columna incomes.nights viene a 0).
--      - importe = amount_gross (bruto ~ precio de listado), no amount (neto de comisión).
--
-- Aplicada a mano en Supabase (wswbehlcuxqxyinousql) el 2026-06-22. Idempotente y
-- re-ejecutable: SELECT update_experiment_results();

CREATE OR REPLACE FUNCTION public.update_experiment_results()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE pricing_experiments pe
  SET
    was_booked        = sub.booked,
    revenue_realized  = CASE WHEN sub.booked THEN COALESCE(sub.adr, pe.price_set) ELSE 0 END,
    result_checked_at = now()
  FROM (
    SELECT DISTINCT ON (rs.property_id, rs.rate_date)
      rs.property_id,
      rs.rate_date,
      rs.was_booked AS booked,
      (
        SELECT ROUND(
                 COALESCE(i.amount_gross, i.amount)
                 / NULLIF((i."checkOut"::date - i."checkIn"::date), 0)
               )::integer
        FROM incomes i
        WHERE i."propertyId"   = rs.property_id
          AND i."checkIn"::date  <= rs.rate_date
          AND i."checkOut"::date >  rs.rate_date
        ORDER BY i."checkIn" DESC
        LIMIT 1
      ) AS adr
    FROM rate_snapshots rs
    WHERE rs.was_booked IS NOT NULL
    ORDER BY rs.property_id, rs.rate_date, rs.snapshot_date DESC
  ) sub
  WHERE pe.property_id = sub.property_id
    AND pe.rate_date   = sub.rate_date
    AND pe.rate_date   < CURRENT_DATE
    AND pe.was_booked IS NULL;

  -- Fallback: fecha pasada sin snapshot con señal -> libre.
  UPDATE pricing_experiments
  SET was_booked = false, revenue_realized = 0, result_checked_at = now()
  WHERE rate_date < CURRENT_DATE
    AND was_booked IS NULL;
END;
$function$;
