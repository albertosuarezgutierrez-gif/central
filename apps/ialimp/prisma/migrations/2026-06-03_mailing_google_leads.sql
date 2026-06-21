-- Recolector de leads desde Google Places API.
-- Los leads de Google a veces solo traen teléfono/web (sin email) → email pasa a
-- ser opcional. `google_place_id` evita duplicados al re-buscar (idempotencia).
ALTER TABLE mailing_prospectos ALTER COLUMN email DROP NOT NULL;
ALTER TABLE mailing_prospectos ADD COLUMN IF NOT EXISTS google_place_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_mailing_prospectos_place
  ON mailing_prospectos (google_place_id) WHERE google_place_id IS NOT NULL;
