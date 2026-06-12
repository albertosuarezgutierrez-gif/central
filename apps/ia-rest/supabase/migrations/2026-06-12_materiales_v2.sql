-- ============================================================
-- Materiales v2 — Módulo extendido
-- BD: ia-rest (efncqyvhniaxsirhdxaa, schema public)
-- Añade columnas nuevas a `materiales` y crea tablas
-- `materiales_espacios` y `materiales_transferencias`.
-- ============================================================

-- ── Columnas nuevas en `materiales` ─────────────────────────

ALTER TABLE materiales
  ADD COLUMN IF NOT EXISTS tipo                   text NOT NULL DEFAULT 'consumible',
  ADD COLUMN IF NOT EXISTS estado                 text NOT NULL DEFAULT 'operativo',
  ADD COLUMN IF NOT EXISTS stock_minimo           int,
  ADD COLUMN IF NOT EXISTS espacio_actual_id      uuid,
  ADD COLUMN IF NOT EXISTS precio_compra          numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo                 text,
  ADD COLUMN IF NOT EXISTS proveedor_referencia   text,
  ADD COLUMN IF NOT EXISTS proveedor_fecha_compra date,
  ADD COLUMN IF NOT EXISTS garantia_hasta         date,
  ADD COLUMN IF NOT EXISTS documentos             jsonb;

-- ── Espacios ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materiales_espacios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  uuid NOT NULL,
  nombre          text NOT NULL,
  descripcion     text,
  tipo            text NOT NULL DEFAULT 'otro',   -- almacen|piso|furgoneta|taller|otro
  ref_tipo        text,                           -- tipo de entidad externa vinculada
  ref_id          uuid,                           -- id de la entidad externa (sin FK dura)
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_espacios_restaurante ON materiales_espacios (restaurante_id);

-- ── Transferencias ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materiales_transferencias (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  espacio_origen_id   uuid NOT NULL,
  espacio_destino_id  uuid NOT NULL,
  cantidad            int NOT NULL DEFAULT 1,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  nota                text,
  realizado_por       uuid,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_transf_restaurante ON materiales_transferencias (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_transf_material    ON materiales_transferencias (material_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE materiales_espacios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_transferencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON materiales_espacios;
CREATE POLICY service_role_all ON materiales_espacios
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON materiales_transferencias;
CREATE POLICY service_role_all ON materiales_transferencias
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
