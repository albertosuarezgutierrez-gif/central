-- Datos del Catastro por piso turístico (27/09/2026). Los rellena el job semanal
-- /api/cron/catastro-pisos. NULL en catastro_* = «todavía no se sabe», nunca 0.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS ref_catastral text,
  ADD COLUMN IF NOT EXISTS catastro_m2 integer,
  ADD COLUMN IF NOT EXISTS catastro_anio integer,
  ADD COLUMN IF NOT EXISTS catastro_uso text,
  ADD COLUMN IF NOT EXISTS catastro_direccion text,
  ADD COLUMN IF NOT EXISTS catastro_cp text,
  -- ok · compartida (varios pisos, una referencia: m² del edificio) · elegir (varios pisos en el portal: hace falta la referencia) · no_encontrado · direccion_ilegible · error
  ADD COLUMN IF NOT EXISTS catastro_estado text,
  ADD COLUMN IF NOT EXISTS catastro_detalle text,
  ADD COLUMN IF NOT EXISTS catastro_revisado_at timestamptz;

-- Referencia confirmada por Alberto (27/09/2026).
UPDATE properties SET ref_catastral = '5029006TG3452G0019BG'
 WHERE id = 'prop_duplex_center' AND ref_catastral IS NULL;
