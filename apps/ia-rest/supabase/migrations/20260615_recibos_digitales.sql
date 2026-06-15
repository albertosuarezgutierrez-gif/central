-- recibos_digitales: snapshot público del ticket de cuenta para el e-recibo por QR.
-- Vive en el schema iarest del proyecto compartido (wswbehlcuxqxyinousql).
CREATE TABLE IF NOT EXISTS iarest.recibos_digitales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT UNIQUE NOT NULL,
  local_id      UUID NOT NULL,
  comanda_id    UUID,
  factura_verifactu_id UUID,
  snapshot      JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recibos_token ON iarest.recibos_digitales(token);
CREATE INDEX IF NOT EXISTS idx_recibos_local ON iarest.recibos_digitales(local_id);
ALTER TABLE iarest.recibos_digitales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON iarest.recibos_digitales
  USING (auth.role() = 'service_role');
