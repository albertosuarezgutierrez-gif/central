-- Marca ANTICIPADA de experimentos de pricing — acelera la evidencia para la baja de PriceLabs.
--
-- Problema: update_experiment_results() solo cerraba experimentos de fechas PASADAS
-- (rate_date < CURRENT_DATE). Una reserva hecha hoy para dentro de 3 meses no contaba
-- hasta que llegara la fecha → la base de evidencia "reservado a nuestro precio" crecía
-- con meses de retraso (13/07/2026: 17 noches de experimento ya vendidas y 0 contadas).
--
-- Solución (bloque 3 nuevo): si un income cubre la noche futura del experimento
-- (checkIn <= rate_date < checkOut), se marca was_booked=true YA, con el ADR bruto real
-- del income como revenue_realized. Cancelaciones: al llegar el día, el bloque 1
-- (fechas pasadas) re-alinea con la señal definitiva de rate_snapshots — su WHERE pasa
-- de `pe.was_booked IS NULL` a `pe.was_booked IS DISTINCT FROM sub.booked` para poder
-- corregir filas marcadas anticipadamente cuya reserva se canceló.
--
-- Aplicada en Supabase (wswbehlcuxqxyinousql) el 2026-07-13 vía MCP. Idempotente y
-- re-ejecutable: SELECT update_experiment_results();
-- Primera pasada real: Busto pasó de 0 a 14 experimentos con was_booked=true.

CREATE OR REPLACE FUNCTION public.update_experiment_results()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Fechas PASADAS: resultado definitivo desde rate_snapshots.was_booked.
  -- (2026-07-13) También re-alinea filas marcadas anticipadamente cuya reserva
  -- se canceló: si la señal definitiva difiere, manda la de rate_snapshots.
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
    AND pe.was_booked IS DISTINCT FROM sub.booked;

  -- Fallback: fecha pasada sin snapshot con señal -> libre.
  UPDATE pricing_experiments
  SET was_booked = false, revenue_realized = 0, result_checked_at = now()
  WHERE rate_date < CURRENT_DATE
    AND was_booked IS NULL;

  -- Marca ANTICIPADA (2026-07-13): fecha FUTURA cuya noche ya está vendida
  -- (hay un income que la cubre) -> cuenta el resultado YA en vez de esperar
  -- a que pase la fecha. Si la reserva se cancela, el bloque de fechas
  -- pasadas re-alinea con rate_snapshots al llegar el día.
  UPDATE pricing_experiments pe
  SET
    was_booked        = true,
    revenue_realized  = COALESCE(sub.adr, pe.price_set),
    result_checked_at = now()
  FROM (
    SELECT DISTINCT ON (d.property_id, d.rate_date)
      d.property_id,
      d.rate_date,
      ROUND(
        COALESCE(i.amount_gross, i.amount)
        / NULLIF((i."checkOut"::date - i."checkIn"::date), 0)
      )::integer AS adr
    FROM pricing_experiments d
    JOIN incomes i
      ON i."propertyId"    = d.property_id
     AND i."checkIn"::date <= d.rate_date
     AND i."checkOut"::date > d.rate_date
    WHERE d.rate_date >= CURRENT_DATE
      AND d.was_booked IS NULL
    ORDER BY d.property_id, d.rate_date, i."checkIn" DESC
  ) sub
  WHERE pe.property_id = sub.property_id
    AND pe.rate_date   = sub.rate_date
    AND pe.was_booked IS NULL;
END;
$function$;
