-- Firma electrónica avanzada (eIDAS art. 26): evidencia de firma por documento.
-- Aplicada en Supabase (schema rrhh) el 16/06/2026. RLS on, sin policies (backend rrhh_app BYPASSRLS).

CREATE TABLE IF NOT EXISTS rrhh.firmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  empleado_id uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES rrhh.documentos(id) ON DELETE CASCADE,
  doc_hash text NOT NULL,                 -- SHA-256 (hex) del contenido firmado (integridad / art.26.d)
  algoritmo text NOT NULL DEFAULT 'SHA-256',
  metodo text NOT NULL,                   -- 'sesion_token' | 'otp_email' (control exclusivo / art.26.c)
  firmante_nombre text NOT NULL,
  firmante_email text,
  firmante_dni text,
  ip text,
  user_agent text,
  sello_tiempo timestamptz NOT NULL,      -- momento de la firma
  evidencia jsonb NOT NULL,               -- evidencia completa (core-firma)
  creada_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firmas_documento_idx ON rrhh.firmas(documento_id);
CREATE INDEX IF NOT EXISTS firmas_empresa_idx ON rrhh.firmas(empresa_id);
ALTER TABLE rrhh.firmas ENABLE ROW LEVEL SECURITY;

-- documentos.estado_firma: 'no_requiere' (default) → 'pendiente' (el gestor solicita) → 'firmado'.
