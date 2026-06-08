-- ════════════════════════════════════════════════════════════════
-- MÓDULO RESERVAS · ia.rest
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reservas (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id   UUID        NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  mesa_id          UUID        REFERENCES mesas(id) ON DELETE SET NULL,
  nombre_cliente   TEXT        NOT NULL,
  telefono         TEXT,
  num_personas     INTEGER     NOT NULL DEFAULT 2 CHECK (num_personas > 0),
  fecha_reserva    DATE        NOT NULL,
  hora_reserva     TIME        NOT NULL,
  duracion_min     INTEGER     NOT NULL DEFAULT 90,
  notas            TEXT,
  estado           TEXT        NOT NULL DEFAULT 'pendiente'
                               CHECK (estado IN ('pendiente','confirmada','sentada','cancelada','no_show')),
  canal            TEXT        NOT NULL DEFAULT 'manual'
                               CHECK (canal IN ('manual','thefork','covermanager','web','telefono')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID        REFERENCES camareros(id) ON DELETE SET NULL,
  thefork_id       TEXT        -- para integración futura TheFork
);

CREATE INDEX IF NOT EXISTS idx_reservas_restaurante_fecha
  ON reservas(restaurante_id, fecha_reserva);

CREATE INDEX IF NOT EXISTS idx_reservas_estado
  ON reservas(restaurante_id, estado, fecha_reserva);

-- ─── RLS ───────────────────────────────────────────────────────
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;

-- Service role (Edge Functions, API routes) tiene acceso total
CREATE POLICY "service_role_reservas" ON reservas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── DEMO seed data ────────────────────────────────────────────
-- Inserta 5 reservas de hoy en el restaurante DEMO para poder
-- probar el módulo inmediatamente tras aplicar la migración.
DO $$
DECLARE
  v_rest_id UUID;
BEGIN
  SELECT id INTO v_rest_id FROM restaurantes WHERE slug = 'demo' LIMIT 1;
  IF v_rest_id IS NULL THEN RETURN; END IF;

  INSERT INTO reservas (restaurante_id, nombre_cliente, telefono, num_personas,
    fecha_reserva, hora_reserva, duracion_min, notas, estado, canal)
  VALUES
    (v_rest_id, 'Mesa García',   '+34 611 000 001', 2, CURRENT_DATE, '13:00', 90,  NULL,               'confirmada', 'telefono'),
    (v_rest_id, 'Familia López', '+34 622 000 002', 5, CURRENT_DATE, '14:00', 120, 'Mesa grande, niños','confirmada', 'manual'),
    (v_rest_id, 'Pérez & cía',   '+34 633 000 003', 3, CURRENT_DATE, '14:30', 90,  'Alérgica al gluten','pendiente',  'web'),
    (v_rest_id, 'Sandra M.',     NULL,              2, CURRENT_DATE, '21:00', 90,  'Aniversario 🎂',   'confirmada', 'manual'),
    (v_rest_id, 'Grupo empresa', '+34 644 000 005', 8, CURRENT_DATE, '21:30', 120, 'Cena de empresa',  'pendiente',  'telefono')
  ON CONFLICT DO NOTHING;
END $$;
