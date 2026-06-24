-- Idempotencia del agente de huéspedes (webhook ↔ sondeo). Tabla propia: update_logs
-- NO tiene columna `message` (es la tabla de sync de reservas), así que el dedup va aquí.
CREATE TABLE IF NOT EXISTS mensajes_procesados (
  msg_id     TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
