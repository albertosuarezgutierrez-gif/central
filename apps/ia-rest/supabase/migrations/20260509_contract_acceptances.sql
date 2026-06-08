-- ─────────────────────────────────────────────────────────────────────────────
-- contract_acceptances — registro legal de aceptaciones de contrato
-- LSSI art. 27: prueba de consentimiento informado en contratación electrónica
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_acceptances (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id     uuid        REFERENCES restaurantes(id) ON DELETE CASCADE,
  email              text        NOT NULL,
  contract_version   text        NOT NULL DEFAULT '1.0',
  accepted_at        timestamptz NOT NULL DEFAULT now(),
  ip_address         text,
  user_agent         text
);

CREATE INDEX IF NOT EXISTS idx_contract_acceptances_restaurante
  ON contract_acceptances(restaurante_id);

CREATE INDEX IF NOT EXISTS idx_contract_acceptances_email
  ON contract_acceptances(email);

-- RLS: solo service_role puede escribir; owner puede leer la suya
ALTER TABLE contract_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON contract_acceptances
  FOR ALL USING (auth.role() = 'service_role');

-- Comentario de tabla
COMMENT ON TABLE contract_acceptances IS
  'Registro de aceptaciones del Contrato de Prestación de Servicios SaaS (LSSI art. 27). '
  'Cada fila es una firma electrónica con timestamp, IP y versión del contrato.';
