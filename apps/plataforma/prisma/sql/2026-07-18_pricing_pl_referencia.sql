-- Idea #1 (18/07/2026): curva de PriceLabs por fecha PERSISTIDA.
--
-- El suelo PriceLabs del motor (apply/route.ts) leía la última foto de `rate_snapshots`
-- (ventana 14d). Cuando Alberto cancele PriceLabs (~ago-2026) esa foto caduca y el suelo —la
-- única fuente con resolución POR FECHA de las noches especiales— desaparece. Esta tabla
-- CONGELA la última curva conocida de PL para que sobreviva a la cancelación: el motor la
-- refresca (upsert de la foto más reciente) mientras PL viva, y la usa como suelo hasta
-- PL_REF_MAX_AGE_DAYS (120) tras la última captura, momento en que caduca sola.
--
-- Sin RLS (tabla interna del motor, como el resto de pricing_*); se revoca a anon/authenticated
-- para que no quede expuesta por la API pública de Supabase (BD compartida con ialimp/sivra).

CREATE TABLE IF NOT EXISTS pricing_pl_referencia (
  property_id TEXT    NOT NULL,
  rate_date   DATE    NOT NULL,
  pl_price    INTEGER NOT NULL,
  captured_at DATE    NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (property_id, rate_date)
);

REVOKE ALL ON pricing_pl_referencia FROM anon, authenticated;

-- Backfill inicial: captura la curva ACTUAL de PL (antes de cancelarlo). Idempotente: solo
-- sobrescribe si la foto entrante es igual o más reciente que la ya guardada.
INSERT INTO pricing_pl_referencia (property_id, rate_date, pl_price, captured_at)
SELECT property_id, rate_date, price_pricelabs::int, snapshot_date
FROM rate_snapshots
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM rate_snapshots)
  AND rate_date >= CURRENT_DATE AND price_pricelabs > 0
ON CONFLICT (property_id, rate_date) DO UPDATE
  SET pl_price = EXCLUDED.pl_price, captured_at = EXCLUDED.captured_at
  WHERE pricing_pl_referencia.captured_at <= EXCLUDED.captured_at;
