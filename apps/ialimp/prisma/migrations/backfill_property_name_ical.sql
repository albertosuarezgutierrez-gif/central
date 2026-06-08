-- Backfill de property_name en cleaning_sessions importadas por iCal (legacy)
-- Algunas sesiones antiguas de iCal se crearon con el slug legacy en property_id
-- (prop_*), sin property_name y sin propiedad_id → en la UI salían como "Sin piso".
-- Rellena property_name con el nombre canónico (más frecuente) de cada piso,
-- por empresa, excluyendo nombres de prueba [TEST]. Idempotente.
-- Aplicado en Supabase el 2026-06-02.

WITH canon AS (
  SELECT property_id, empresa_id,
         mode() WITHIN GROUP (ORDER BY property_name) AS nombre
  FROM cleaning_sessions
  WHERE property_name IS NOT NULL AND property_name <> ''
    AND property_name NOT ILIKE '[TEST]%'
  GROUP BY property_id, empresa_id
)
UPDATE cleaning_sessions t
SET property_name = c.nombre
FROM canon c
WHERE t.property_id = c.property_id
  AND t.empresa_id  = c.empresa_id
  AND (t.property_name IS NULL OR t.property_name = '')
  AND c.nombre IS NOT NULL;
