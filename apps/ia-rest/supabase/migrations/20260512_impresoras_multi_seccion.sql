-- ================================================================
-- ia.rest · impresoras: soporte multi-sección
-- 2026-05-12
--
-- Añade secciones_ids TEXT[] para que una impresora pueda
-- recibir tickets de varias secciones.
-- Mantiene seccion_id por retrocompatibilidad (se usa como
-- "sección principal" y se rellena desde secciones_ids[1]).
-- ================================================================

-- 1. Añadir columna array
ALTER TABLE impresoras
  ADD COLUMN IF NOT EXISTS secciones_ids TEXT[] NOT NULL DEFAULT '{}';

-- 2. Migrar datos existentes: seccion_id → secciones_ids
UPDATE impresoras
SET    secciones_ids = ARRAY[seccion_id]
WHERE  seccion_id IS NOT NULL
  AND  (secciones_ids IS NULL OR cardinality(secciones_ids) = 0);

-- 3. Índice GIN para búsquedas eficientes por sección
CREATE INDEX IF NOT EXISTS idx_impresoras_secciones_ids
  ON impresoras USING GIN (secciones_ids);

-- 4. Función helper: comprueba si una impresora sirve a una sección
CREATE OR REPLACE FUNCTION impresora_sirve_seccion(
  imp_secciones TEXT[],
  seccion       TEXT
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT seccion = ANY(imp_secciones)
$$;
