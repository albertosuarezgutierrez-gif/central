-- Acciones que el agente de contabilidad PROPONE y Alberto CONFIRMA (Fase 2).
-- Multi-tenant: scoped por cuenta_id. Aplicar como postgres (Supabase MCP).

CREATE TABLE IF NOT EXISTS contable_accion (
  id          BIGSERIAL PRIMARY KEY,
  cuenta_id   UUID NOT NULL,
  tipo        TEXT NOT NULL,                 -- clasificar | amortizable | confirmar
  params      JSONB NOT NULL,                -- {movId, concepto, destino?, propiedad?, valor?}
  resumen     TEXT,                          -- frase legible para la tarjeta de confirmación
  estado      TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | ejecutada | descartada | error
  resultado   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contable_accion_cuenta_estado ON contable_accion (cuenta_id, estado);
