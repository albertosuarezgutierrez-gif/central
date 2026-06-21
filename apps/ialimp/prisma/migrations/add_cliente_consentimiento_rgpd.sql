-- =====================================================================
-- Migración: consentimiento RGPD del cliente para acceder a su intranet
-- El cliente, al entrar por primera vez al portal /propietario/[token],
-- debe autorizar el tratamiento de sus datos a cambio del acceso gratuito.
-- Guardamos un snapshot en `clientes` + histórico auditable (fecha, IP, UA).
-- Aditiva e idempotente (IF NOT EXISTS): segura sobre la BD en producción.
-- =====================================================================

-- 1. Snapshot del consentimiento vigente en el propio cliente
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rgpd_aceptado    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rgpd_aceptado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rgpd_version     TEXT;

-- 2. Histórico de consentimientos (evidencia para auditoría RGPD)
CREATE TABLE IF NOT EXISTS cliente_consentimientos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL,
  cliente_id  UUID NOT NULL,
  version     TEXT NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  aceptado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_cliente ON cliente_consentimientos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cc_empresa ON cliente_consentimientos(empresa_id);

COMMENT ON TABLE cliente_consentimientos IS
  'Histórico de aceptaciones RGPD del cliente (intranet). Evidencia: versión del texto, fecha, IP y user-agent.';
COMMENT ON COLUMN clientes.rgpd_aceptado IS
  'true si el cliente autorizó el tratamiento de sus datos en la versión vigente (rgpd_version).';
