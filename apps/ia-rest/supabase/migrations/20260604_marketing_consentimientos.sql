-- Marketing · Consentimientos del cliente (opt-in publicidad)
-- ---------------------------------------------------------------------------
-- A DIFERENCIA de qr_avisos_suscripciones (transaccional, se borra enseguida),
-- esta tabla guarda el contacto a LARGO PLAZO, pero SOLO con consentimiento
-- explícito del cliente y cumpliendo RGPD / LSSI-CE:
--   · opt-in activo (casilla NO premarcada) — lo garantiza el cliente
--   · consentimientos SEPARADOS: bar e ia.rest son dos "sí" independientes
--   · prueba del consentimiento: texto exacto + fecha
--   · baja de un clic vía baja_token (revocación por responsable)
--
-- Una persona puede dar consentimiento en varios bares → la unicidad es por
-- (restaurante_id, telefono). El consentimiento a ia.rest se interpreta como
-- "true en cualquier fila de ese teléfono".

CREATE TABLE IF NOT EXISTS marketing_consentimientos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id        UUID NOT NULL,
  telefono              TEXT NOT NULL,                 -- E.164 (dígitos), normalizado
  consiente_bar         BOOLEAN NOT NULL DEFAULT false,
  consiente_iarest      BOOLEAN NOT NULL DEFAULT false,
  texto_consentimiento  TEXT,                          -- prueba: texto exacto aceptado
  origen                TEXT NOT NULL DEFAULT 'qr',     -- de dónde vino el opt-in
  baja_token            UUID NOT NULL DEFAULT gen_random_uuid(),
  revocado_bar_en       TIMESTAMPTZ,
  revocado_iarest_en    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, telefono)
);

CREATE INDEX IF NOT EXISTS idx_mkt_consent_restaurante
  ON marketing_consentimientos(restaurante_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_consent_baja
  ON marketing_consentimientos(baja_token);
-- Para campañas de ia.rest (across bares): localizar consentimientos vigentes por teléfono
CREATE INDEX IF NOT EXISTS idx_mkt_consent_telefono
  ON marketing_consentimientos(telefono);

ALTER TABLE marketing_consentimientos ENABLE ROW LEVEL SECURITY;

-- Solo service role (API routes server-side). El cliente nunca accede directo.
DROP POLICY IF EXISTS "service_role_all" ON marketing_consentimientos;
CREATE POLICY "service_role_all" ON marketing_consentimientos
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
