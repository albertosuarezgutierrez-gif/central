-- =====================================================================
-- Migración: catastro_fields en propiedades
-- Añade municipio, provincia y referencia_catastral
-- municipio/provincia se autocompletan desde el CP via Nominatim
-- referencia_catastral la añade el dueño manualmente (opcional)
-- =====================================================================

ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS municipio            TEXT,
  ADD COLUMN IF NOT EXISTS provincia            TEXT,
  ADD COLUMN IF NOT EXISTS referencia_catastral TEXT;
