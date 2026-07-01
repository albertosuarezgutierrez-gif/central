-- Extend learned rules table to store personal sub-category
ALTER TABLE banca_destino_reglas
  ADD COLUMN IF NOT EXISTS subcategoria TEXT;

-- Configurable spend alerts per category
CREATE TABLE IF NOT EXISTS categoria_alertas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria      TEXT NOT NULL,
  limite_mensual NUMERIC(10,2) NOT NULL,
  activa         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (categoria)
);

-- Throttle log: max 1 alert per category per 24h
CREATE TABLE IF NOT EXISTS categoria_alertas_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria   TEXT NOT NULL,
  enviado_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alertas_log_categoria_fecha
  ON categoria_alertas_log (categoria, enviado_at DESC);
