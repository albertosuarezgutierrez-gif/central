-- ═══════════════════════════════════════════════════════════
-- MÓDULO QR — Mesa Digital v1.0
-- Mayo 2026
-- ═══════════════════════════════════════════════════════════

-- ── 1. STRIPE CONNECT en restaurantes ───────────────────────
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_onboarded  BOOLEAN DEFAULT FALSE;

-- ── 2. CONFIG QR en mesas ────────────────────────────────────
ALTER TABLE mesas
  ADD COLUMN IF NOT EXISTS qr_habilitado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qr_modo_pago  TEXT DEFAULT 'solo_pedido'
    CHECK (qr_modo_pago IN ('solo_pedido', 'opcional', 'obligatorio')),
  ADD COLUMN IF NOT EXISTS qr_token      TEXT UNIQUE;

-- ── 3. SESIONES CLIENTE QR ───────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_sesiones_cliente (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mesa_id             UUID NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT,          -- Stripe customer efímero
  payment_method_id   TEXT,          -- guardado al registrar tarjeta
  payment_intent_id   TEXT,          -- al cobrar
  estado              TEXT NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa','pagada','abandonada')),
  propina_pct         INTEGER DEFAULT 0,
  propina_amt         NUMERIC(10,2) DEFAULT 0,
  total_cobrado       NUMERIC(10,2),
  checkout_session_id TEXT,
  creado_en           TIMESTAMPTZ DEFAULT NOW(),
  pagado_en           TIMESTAMPTZ,
  CONSTRAINT fk_qr_restaurante FOREIGN KEY (restaurante_id) REFERENCES restaurantes(id)
);

CREATE INDEX IF NOT EXISTS idx_qr_sesiones_mesa    ON qr_sesiones_cliente(mesa_id);
CREATE INDEX IF NOT EXISTS idx_qr_sesiones_estado  ON qr_sesiones_cliente(estado);
CREATE INDEX IF NOT EXISTS idx_qr_sesiones_rest    ON qr_sesiones_cliente(restaurante_id);

-- ── 4. VALORACIONES QR ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_valoraciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id      UUID NOT NULL REFERENCES qr_sesiones_cliente(id) ON DELETE CASCADE,
  restaurante_id UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  estrellas      INTEGER NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
  comentario     TEXT,
  creado_en      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. FUNCIÓN: generar token QR único por mesa ───────────────
CREATE OR REPLACE FUNCTION generar_qr_token(p_mesa_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(16), 'hex');
  UPDATE mesas SET qr_token = v_token WHERE id = p_mesa_id;
  RETURN v_token;
END;
$$;

-- ── 6. RLS ────────────────────────────────────────────────────
ALTER TABLE qr_sesiones_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_valoraciones     ENABLE ROW LEVEL SECURITY;

-- qr_sesiones_cliente: solo service_role (acceso via Edge Functions)
CREATE POLICY "service_role_all_qr_sesiones"
  ON qr_sesiones_cliente FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "service_role_all_qr_valoraciones"
  ON qr_valoraciones FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- ── 7. GENERAR TOKENS para mesas existentes ──────────────────
-- (solo mesas que no tengan token aún)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM mesas WHERE qr_token IS NULL LOOP
    PERFORM generar_qr_token(r.id);
  END LOOP;
END;
$$;
