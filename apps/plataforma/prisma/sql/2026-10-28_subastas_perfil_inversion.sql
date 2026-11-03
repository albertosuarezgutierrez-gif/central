-- Perfil de inversión en el radar de subastas (casa unifamiliar, municipios
-- concretos, dormitorios/baños, piscina o parcela). TODO opcional: NULL / vacío
-- = «no filtra», así que las cuentas existentes se comportan exactamente igual.
-- Dormitorios, baños, piscina y parcela solo filtran si la subasta TRAE el dato;
-- si no lo trae, la subasta pasa marcada como pendiente (no es «no cumple»).
ALTER TABLE subastas_criterios
  ADD COLUMN IF NOT EXISTS municipios text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS solo_unifamiliar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dormitorios_min int,
  ADD COLUMN IF NOT EXISTS banos_min int,
  ADD COLUMN IF NOT EXISTS superficie_parcela_min numeric,
  ADD COLUMN IF NOT EXISTS requiere_piscina boolean NOT NULL DEFAULT false;
