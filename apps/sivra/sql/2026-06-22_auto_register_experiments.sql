-- Idea 1 (baja de PriceLabs): auto-registro de experimentos desde las escrituras LIVE.
--
-- Cada fecha futura donde aplicamos NUESTRO precio en vivo (pricing_applied, dry_run=false)
-- pasa a ser un pricing_experiment. Lo llama a diario el cron check-results (junto a
-- update_experiment_results), así la base de evidencia se construye sola.
--
--  * price_set       = precio aplicado más reciente (DISTINCT ON applied_at DESC).
--  * price_pricelabs = baseline de PL del snapshot MÁS ANTIGUO de esa fecha (antes de cualquier
--                      override → evita la contaminación de price_pricelabs cuando pisamos Smoobu).
--  * price_ours      = precio hipotético del motor (último snapshot), informativo.
-- No pisa experimentos manuales (notes NOT LIKE 'Auto-registrado%') ni los ya cerrados.
--
-- Aplicada a mano en Supabase (wswbehlcuxqxyinousql) el 2026-06-22. Idempotente.
-- Backfill inicial: SELECT auto_register_experiments();  -> 344 experimentos.

CREATE OR REPLACE FUNCTION public.auto_register_experiments()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  INSERT INTO pricing_experiments (property_id, rate_date, price_set, price_pricelabs, price_ours, notes)
  SELECT DISTINCT ON (pa.property_id, pa.rate_date)
    pa.property_id,
    pa.rate_date,
    pa.new_price,
    COALESCE(
      (SELECT rs.price_pricelabs FROM rate_snapshots rs
       WHERE rs.property_id = pa.property_id AND rs.rate_date = pa.rate_date
         AND rs.price_pricelabs IS NOT NULL
       ORDER BY rs.snapshot_date ASC LIMIT 1),
      pa.old_price),
    (SELECT rs.price_ours FROM rate_snapshots rs
     WHERE rs.property_id = pa.property_id AND rs.rate_date = pa.rate_date
       AND rs.price_ours IS NOT NULL
     ORDER BY rs.snapshot_date DESC LIMIT 1),
    'Auto-registrado (' || pa.source || '): aplicado ' || pa.new_price || E'€ live'
  FROM pricing_applied pa
  WHERE pa.dry_run = false
    AND pa.rate_date > CURRENT_DATE
  ORDER BY pa.property_id, pa.rate_date, pa.applied_at DESC
  ON CONFLICT (property_id, rate_date) DO UPDATE
    SET price_set = EXCLUDED.price_set,
        price_ours = EXCLUDED.price_ours,
        notes      = EXCLUDED.notes
    WHERE pricing_experiments.was_booked IS NULL
      AND pricing_experiments.notes LIKE 'Auto-registrado%';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
