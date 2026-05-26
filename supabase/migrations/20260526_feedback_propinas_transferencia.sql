-- ============================================================
-- ia.rest · Migración 26/05/2026
-- Módulos: feedback_visita + propinas_digitales + transferencia camarero
-- ============================================================

-- 1. FEEDBACK VISITA
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_visita (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id   UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  comanda_id       UUID REFERENCES comandas(id) ON DELETE SET NULL,
  token            TEXT UNIQUE NOT NULL,
  cliente_email    TEXT,
  cliente_nombre   TEXT,
  nota             INTEGER CHECK (nota >= 1 AND nota <= 5),
  comentario       TEXT,
  estado           TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | respondido
  respondido_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE feedback_visita ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_feedback" ON feedback_visita
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_feedback_restaurante ON feedback_visita(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_feedback_token ON feedback_visita(token);

-- Columnas en comandas para feedback
ALTER TABLE comandas
  ADD COLUMN IF NOT EXISTS cliente_email       TEXT,
  ADD COLUMN IF NOT EXISTS cliente_nombre      TEXT,
  ADD COLUMN IF NOT EXISTS feedback_enviado_at TIMESTAMPTZ;

-- Columnas en restaurantes para feedback y Google
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS feedback_activo    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_review_url  TEXT,
  ADD COLUMN IF NOT EXISTS dominio_custom     TEXT;

-- 2. PROPINAS DIGITALES
-- ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS propinas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id   UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  comanda_id       UUID REFERENCES comandas(id) ON DELETE SET NULL,
  turno_id         UUID REFERENCES turnos(id) ON DELETE SET NULL,
  token            TEXT UNIQUE NOT NULL,
  importe          DECIMAL(10,2),
  stripe_payment_intent TEXT,
  estado           TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | pagada | cancelada
  pagada_at        TIMESTAMPTZ,
  reparto          JSONB, -- [{ camarero_id, nombre, porcentaje, importe }]
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE propinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_propinas" ON propinas
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_propinas_restaurante ON propinas(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_propinas_turno       ON propinas(turno_id);

-- Config propinas en restaurantes
ALTER TABLE restaurantes
  ADD COLUMN IF NOT EXISTS propinas_activas        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propinas_reparto_modo   TEXT NOT NULL DEFAULT 'equitativo',
  -- 'equitativo' = entre todos del turno | 'mesa' = solo camarero de la mesa
  ADD COLUMN IF NOT EXISTS propinas_opciones_eur   JSONB DEFAULT '[1, 2, 3, 5]'::jsonb;
  -- importes sugeridos en pantalla

-- 3. COMANDA_AUDIT — añadir acción 'transferencia' si no existe
-- (ya existe la tabla, solo documentamos el nuevo tipo)
-- No requiere ALTER TABLE, el campo accion es TEXT libre.

