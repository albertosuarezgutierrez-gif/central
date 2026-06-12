-- ============================================================
-- Materiales ledger — Fase A
-- Añade: materiales_movimientos, materiales_unidades
-- Altera: materiales (codigo_qr), materiales_espacios (codigo_qr)
-- BD: ia-rest (efncqyvhniaxsirhdxaa, schema public)
-- ============================================================

-- ── QR columns ───────────────────────────────────────────────

ALTER TABLE materiales
  ADD COLUMN IF NOT EXISTS codigo_qr text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_materiales_qr
  ON materiales (codigo_qr) WHERE codigo_qr IS NOT NULL;

ALTER TABLE materiales_espacios
  ADD COLUMN IF NOT EXISTS codigo_qr text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mat_espacios_qr
  ON materiales_espacios (codigo_qr) WHERE codigo_qr IS NOT NULL;

-- ── Ledger de movimientos ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS materiales_movimientos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  unidad_id           uuid,
  tipo                text NOT NULL,
  cantidad            int  NOT NULL CHECK (cantidad > 0),
  espacio_origen_id   uuid REFERENCES materiales_espacios(id),
  espacio_destino_id  uuid REFERENCES materiales_espacios(id),
  parent_tipo         text,
  parent_id           uuid,
  cliente_id          uuid,
  notas               text,
  realizado_por       uuid,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mat_mov_restaurante ON materiales_movimientos (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_mov_material    ON materiales_movimientos (material_id);
CREATE INDEX IF NOT EXISTS idx_mat_mov_tipo        ON materiales_movimientos (tipo);
CREATE INDEX IF NOT EXISTS idx_mat_mov_fecha       ON materiales_movimientos (fecha);
CREATE INDEX IF NOT EXISTS idx_mat_mov_parent
  ON materiales_movimientos (parent_id) WHERE parent_id IS NOT NULL;

-- ── Activos serializados ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS materiales_unidades (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id    uuid NOT NULL,
  material_id       uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  codigo_serie      text,
  codigo_qr         text NOT NULL,
  estado            text NOT NULL DEFAULT 'operativo',
  espacio_actual_id uuid REFERENCES materiales_espacios(id),
  fecha_compra      date,
  garantia_hasta    date,
  precio_compra     numeric(10,2),
  vida_util_anios   int,
  notas             text,
  activo            boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mat_unidades_qr
  ON materiales_unidades (codigo_qr);
CREATE INDEX IF NOT EXISTS idx_mat_unidades_restaurante
  ON materiales_unidades (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_unidades_material
  ON materiales_unidades (material_id);

-- ── FK movimientos → unidades (ambas tablas ya existen) ──────

ALTER TABLE materiales_movimientos
  ADD CONSTRAINT fk_mat_mov_unidad
  FOREIGN KEY (unidad_id) REFERENCES materiales_unidades(id)
  ON DELETE SET NULL
  NOT VALID;

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE materiales_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_unidades    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON materiales_movimientos;
CREATE POLICY service_role_all ON materiales_movimientos
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON materiales_unidades;
CREATE POLICY service_role_all ON materiales_unidades
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
