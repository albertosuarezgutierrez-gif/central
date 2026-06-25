-- FASE 2 del panel de secretos: rastro de auditoría de las ediciones de env vars.
-- NO guarda el valor, solo QUIÉN cambió QUÉ clave de QUÉ proyecto y CUÁNDO.
-- Global de operador (sin scope de inquilino), como la tabla `superadmins`.
CREATE TABLE IF NOT EXISTS secrets_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email    text NOT NULL,
  accion         text NOT NULL,              -- 'upsert' (v1: no hay borrado por panel)
  env_key        text NOT NULL,
  vercel_project text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_secrets_audit_created ON secrets_audit (created_at DESC);
