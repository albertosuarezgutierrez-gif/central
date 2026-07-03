-- Memoria y traza del agente de contabilidad conversacional (Fase 1).
-- Multi-tenant: scoped por cuenta_id. Aplicar como postgres (Supabase MCP), NO por el rol de la app.
-- Supabase auto-activa RLS en tablas nuevas de public; el rol prisma_plataforma tiene BYPASSRLS,
-- así que la app lee/escribe sin políticas. NO exponer estas tablas por REST/anon.

CREATE TABLE IF NOT EXISTS contable_memoria (
  id          BIGSERIAL PRIMARY KEY,
  cuenta_id   UUID NOT NULL,
  clave       TEXT NOT NULL,
  insight     TEXT NOT NULL,
  metricas    JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, clave)
);

CREATE TABLE IF NOT EXISTS contable_log (
  id          BIGSERIAL PRIMARY KEY,
  cuenta_id   UUID NOT NULL,
  canal       TEXT NOT NULL DEFAULT 'web',
  rol         TEXT NOT NULL,            -- 'user' | 'assistant'
  mensaje     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contable_log_cuenta_fecha ON contable_log (cuenta_id, created_at DESC);
