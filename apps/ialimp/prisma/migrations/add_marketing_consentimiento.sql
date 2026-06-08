-- =====================================================================
-- Migración: separar el consentimiento de MARKETING del de servicio.
-- RGPD/EDPB: condicionar el acceso al servicio a aceptar comunicaciones
-- comerciales hace que ese consentimiento NO sea libre (art. 7.4) → inválido.
-- Por eso el marketing pasa a ser un consentimiento APARTE y OPCIONAL.
-- Aditiva e idempotente (IF NOT EXISTS): segura sobre la BD en producción.
-- =====================================================================

-- 1. Snapshot del consentimiento de marketing en el propio cliente
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS marketing_aceptado    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_aceptado_at TIMESTAMPTZ;

-- 2. Registrar en el histórico qué se aceptó en cada evento (evidencia)
ALTER TABLE cliente_consentimientos
  ADD COLUMN IF NOT EXISTS marketing BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN clientes.marketing_aceptado IS
  'true si el cliente autorizó (opcional) recibir comunicaciones comerciales de IALIMP y empresas asociadas.';
COMMENT ON COLUMN cliente_consentimientos.marketing IS
  'true si en este evento el cliente marcó además la casilla opcional de marketing.';
