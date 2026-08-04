-- Referencia €/m² por zona desde el buscador de Fotocasa (edge `zona-fotocasa`).
-- Caché por slug de zona; las subastas pintan su zona vía subastas.precio_m2_zona.
CREATE TABLE IF NOT EXISTS mercado_zonas (
  slug text PRIMARY KEY,
  municipio text NOT NULL,
  p25_m2 numeric,
  p50_m2 numeric,
  p75_m2 numeric,
  muestra integer NOT NULL DEFAULT 0,
  total_zona integer,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON mercado_zonas FROM anon, authenticated;
GRANT ALL ON mercado_zonas TO prisma_plataforma;

ALTER TABLE subastas ADD COLUMN IF NOT EXISTS precio_m2_zona numeric;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS muestra_zona integer;
