-- Asignación de movimiento bancario a un piso turístico concreto.
-- Rellenado por el agente Telegram cuando el usuario elige un piso al revisar.
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS propiedad_id TEXT;
