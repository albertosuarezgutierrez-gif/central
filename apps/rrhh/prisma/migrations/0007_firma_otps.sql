-- OTP por email (refuerzo del control exclusivo, eIDAS art. 26.c) al firmar.
-- Aplicada en Supabase (schema rrhh) el 16/06/2026. RLS on (backend rrhh_app BYPASSRLS).
-- Un código activo por (documento, empleado); se borra al consumirse o caduca a los 10 min.

CREATE TABLE IF NOT EXISTS rrhh.firma_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  empleado_id uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES rrhh.documentos(id) ON DELETE CASCADE,
  codigo_hash text NOT NULL,           -- SHA-256 del código de 6 dígitos
  expira_at timestamptz NOT NULL,
  intentos int NOT NULL DEFAULT 0,     -- se invalida tras 5 intentos fallidos
  creada_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, empleado_id)
);
ALTER TABLE rrhh.firma_otps ENABLE ROW LEVEL SECURITY;
