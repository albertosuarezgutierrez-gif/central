-- Baja reversible de clientes (desactivar / reactivar).
-- La columna `activo boolean NOT NULL DEFAULT true` YA existe en `clientes`.
-- Aquí solo se añade la auditoría de la baja. Aditiva y retro-compatible.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS desactivado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS desactivado_por    uuid,         -- usuario que la dio de baja
  ADD COLUMN IF NOT EXISTS desactivado_motivo text;
