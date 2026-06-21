-- Acceso definitivo de la limpiadora por "enlace mágico".
-- Token personal por limpiadora: al tocar el enlace /l/acceso/<token> entra
-- directa a la app (sin PIN ni correo). El PIN sigue funcionando como respaldo.

ALTER TABLE limpiadoras
  ADD COLUMN IF NOT EXISTS acceso_token text;

-- Único cuando no es NULL (varias limpiadoras pueden no tener token todavía).
CREATE UNIQUE INDEX IF NOT EXISTS ux_limpiadoras_acceso_token
  ON limpiadoras (acceso_token)
  WHERE acceso_token IS NOT NULL;
