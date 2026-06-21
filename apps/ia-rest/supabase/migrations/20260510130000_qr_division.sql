-- ═══════════════════════════════════════════════════════════
-- MÓDULO QR — División de cuenta v1.0
-- Mayo 2026
-- ═══════════════════════════════════════════════════════════

-- División en sesión
ALTER TABLE qr_sesiones_cliente
  ADD COLUMN IF NOT EXISTS division_modo     TEXT CHECK (division_modo IN ('igual','por_items')),
  ADD COLUMN IF NOT EXISTS division_personas INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS division_slots_pagados INTEGER DEFAULT 0;

-- Slot = una persona en la división
CREATE TABLE IF NOT EXISTS qr_division_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id           UUID NOT NULL REFERENCES qr_sesiones_cliente(id) ON DELETE CASCADE,
  restaurante_id      UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  persona_num         INTEGER NOT NULL,       -- 1, 2, 3...
  modo                TEXT NOT NULL CHECK (modo IN ('igual','por_items')),
  item_ids            JSONB DEFAULT '[]',     -- para modo por_items
  importe             NUMERIC(10,2) NOT NULL,
  propina_amt         NUMERIC(10,2) DEFAULT 0,
  checkout_session_id TEXT,
  pagado              BOOLEAN DEFAULT FALSE,
  pagado_en           TIMESTAMPTZ,
  creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_division_slots_sesion ON qr_division_slots(sesion_id);
CREATE INDEX IF NOT EXISTS idx_division_slots_pagado ON qr_division_slots(pagado);

-- Items reclamados (modo por_items) — para no asignar el mismo item a dos personas
CREATE TABLE IF NOT EXISTS qr_items_reclamados (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id      UUID NOT NULL REFERENCES qr_sesiones_cliente(id) ON DELETE CASCADE,
  comanda_item_id UUID NOT NULL,
  slot_id        UUID REFERENCES qr_division_slots(id),
  creado_en      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sesion_id, comanda_item_id)
);

CREATE INDEX IF NOT EXISTS idx_items_reclamados_sesion ON qr_items_reclamados(sesion_id);

-- RLS
ALTER TABLE qr_division_slots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_items_reclamados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_qr_division_slots"
  ON qr_division_slots FOR ALL USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_qr_items_reclamados"
  ON qr_items_reclamados FOR ALL USING (TRUE) WITH CHECK (TRUE);
