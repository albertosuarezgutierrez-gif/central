-- 2026-08-25 — pricing_experiments deja de fingir un baseline de PriceLabs.
--
-- `auto_register_experiments()` rellenaba price_pricelabs con
-- `rate_snapshots.price_pricelabs` (que PESE AL NOMBRE es el precio VIVO en Smoobu, o sea
-- el nuestro) y, en su defecto, con `pricing_applied.old_price` (inequívocamente nuestro).
-- Con PL de baja desde el 09/08/2026 el A/B se comparaba CONTRA SÍ MISMO. Verificado:
-- prop_busto_reform 2027-08-24 registrada el 25/08 con price_pricelabs=87 cuando Busto
-- nunca tuvo curva PL (la borró 2026-08-15_pl_referencia_reconstruida.sql).
--
-- Es el MISMO fallo que el suelo PL autorreferente del 14/08, en otro sitio. Regla que
-- vuelve a aplicar: una referencia EXTERNA no se recaptura de un espejo que escribes tú.
--
-- ⚠️ ORDEN: aplicar DESPUÉS de desplegar el código que deja de leer price_pricelabs. Si se
-- aplica antes, el `diff_vs_pl` de la UI vieja pinta `price_set - 0` durante unos minutos.
-- La COLUMNA se suelta en la migración de contract, no aquí. Idempotente.

CREATE OR REPLACE FUNCTION public.auto_register_experiments()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  INSERT INTO pricing_experiments (property_id, rate_date, price_set, price_ours, notes)
  SELECT DISTINCT ON (pa.property_id, pa.rate_date)
    pa.property_id,
    pa.rate_date,
    pa.new_price,
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
    SET price_set  = EXCLUDED.price_set,
        price_ours = EXCLUDED.price_ours,
        notes      = EXCLUDED.notes
    WHERE pricing_experiments.was_booked IS NULL
      AND pricing_experiments.notes LIKE 'Auto-registrado%';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
