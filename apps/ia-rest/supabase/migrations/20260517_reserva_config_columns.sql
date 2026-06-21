-- Columnas de configuración de reservas en restaurantes
-- Requeridas por /api/owner/restaurante GET

ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS reserva_bloqueo_previo_min INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserva_tiempo_gracia_min  INTEGER NOT NULL DEFAULT 15;
