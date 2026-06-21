-- ============================================================
-- Dietas de comensales puntuales (cocina / catering)
-- BD: compartida wswbehlcuxqxyinousql · schema iarest (aplicada 2026-06-19)
-- Las dietas son de comensales PUNTUALES (5 sin gluten, 3 veganos…): NO cambian
-- el menú principal. Cada fila de elaboración puede llevar un plato adaptado para
-- un grupo de dieta con su nº de comensales. NULL/NULL = menú principal (todos los PAX).
-- Aditiva y retrocompatible: las filas actuales (dieta NULL) no se tocan.
-- ============================================================

SET search_path TO iarest, public;

ALTER TABLE cocina_evento_elaboraciones
  ADD COLUMN IF NOT EXISTS comensales int,
  ADD COLUMN IF NOT EXISTS dieta text;

COMMENT ON COLUMN cocina_evento_elaboraciones.dieta IS
  'Etiqueta de dieta del grupo (sin gluten, vegano…). NULL = menú principal (todos los PAX).';
COMMENT ON COLUMN cocina_evento_elaboraciones.comensales IS
  'Nº de comensales del grupo de dieta. NULL = menú principal → usa el PAX del evento.';

-- El PK original (evento_id, receta_id) impide tener, en un mismo evento, la fila
-- de menú principal Y filas de dieta para la misma receta. Lo sustituimos por un
-- id sintético + índices únicos parciales que mantienen la integridad correcta.
ALTER TABLE cocina_evento_elaboraciones
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE cocina_evento_elaboraciones
  DROP CONSTRAINT IF EXISTS cocina_evento_elaboraciones_pkey;
ALTER TABLE cocina_evento_elaboraciones
  ADD CONSTRAINT cocina_evento_elaboraciones_pkey PRIMARY KEY (id);

-- 1 fila de menú principal por (evento, receta); 1 fila por (evento, receta, dieta).
CREATE UNIQUE INDEX IF NOT EXISTS cocina_eelab_principal_uq
  ON cocina_evento_elaboraciones (evento_id, receta_id) WHERE dieta IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cocina_eelab_dieta_uq
  ON cocina_evento_elaboraciones (evento_id, receta_id, dieta) WHERE dieta IS NOT NULL;
