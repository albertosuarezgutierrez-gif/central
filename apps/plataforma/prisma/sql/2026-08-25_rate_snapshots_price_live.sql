-- 2026-08-25 — rate_snapshots.price_pricelabs pasa a llamarse price_live (paso 1: EXPAND).
--
-- La columna guarda el precio REAL vivo en Smoobu, lo haya escrito quien lo haya escrito. Se
-- llamó price_pricelabs porque cuando nació lo escribía PriceLabs; PL está de baja desde el
-- 09/08/2026 y hoy lo escribe nuestro motor. El nombre ya ha causado DOS bugs en producción:
--   · 14/08 — el suelo PL se recapturaba de esta columna → suelo autorreferente eterno.
--   · 25/08 — auto_register_experiments() la usaba de «baseline de PriceLabs» → el A/B se
--     medía contra sí mismo y el digest de los lunes lo publicaba como victoria.
--
-- EXPAND/CONTRACT porque el despliegue de Vercel NO es atómico y hay crons a las 07:00, 07:30,
-- 07:45, 08:00, 08:30, 09:00, 09:15, 14:30 y 20:30 UTC: mientras el código viejo siga vivo tiene
-- que poder escribir price_pricelabs y que price_live quede correcta, y viceversa. El trigger
-- sincroniza en ambos sentidos. El DROP va en la migración de CONTRACT, no aquí.
--
-- Idempotente.

ALTER TABLE rate_snapshots ADD COLUMN IF NOT EXISTS price_live integer;

UPDATE rate_snapshots SET price_live = price_pricelabs
WHERE price_live IS NULL AND price_pricelabs IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rate_snapshots_sync_price_live()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.price_live IS NULL AND NEW.price_pricelabs IS NOT NULL THEN
    NEW.price_live := NEW.price_pricelabs;
  ELSIF NEW.price_pricelabs IS NULL AND NEW.price_live IS NOT NULL THEN
    NEW.price_pricelabs := NEW.price_live;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rate_snapshots_sync_price_live ON rate_snapshots;
CREATE TRIGGER trg_rate_snapshots_sync_price_live
  BEFORE INSERT OR UPDATE ON rate_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.rate_snapshots_sync_price_live();
