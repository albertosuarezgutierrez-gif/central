-- Origen e IP del fichaje (04/11/2026). Aditiva e idempotente. NO aplicada a la BD real desde el código.
-- Los fichajes del portal /e no escriben estas columnas (NULL = «no se sabe», nunca 'portal' retroactivo).
-- 🚨 Aplicar ANTES de activar `RRHH_FICHAJE_TALLER_SECRET`: `POST /api/operador/fichajes` las escribe.
ALTER TABLE rrhh.fichajes
  ADD COLUMN IF NOT EXISTS origen_entrada text,
  ADD COLUMN IF NOT EXISTS origen_salida  text,
  ADD COLUMN IF NOT EXISTS ip_entrada     text,
  ADD COLUMN IF NOT EXISTS ip_salida      text;
