-- ============================================================
-- ia.rest · Migración: "Pedir Cuenta" feature
-- 2026-05-14
-- ============================================================
-- 1. Nuevo estado 'cuenta_pedida' en comandas
-- 2. Columna es_caja en impresoras (para ticket de cuenta)
-- ============================================================

-- 1. Ampliar CHECK constraint de comandas.estado
-- Primero eliminamos el constraint existente y lo recreamos
ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_estado_check;
ALTER TABLE comandas ADD CONSTRAINT comandas_estado_check
  CHECK (estado IN ('nueva','en_cocina','lista','cuenta','cuenta_pedida','cerrada'));

-- 2. Añadir columna es_caja a impresoras
ALTER TABLE impresoras
  ADD COLUMN IF NOT EXISTS es_caja BOOLEAN DEFAULT FALSE;

-- Index para búsqueda rápida de impresora de caja
CREATE INDEX IF NOT EXISTS idx_impresoras_es_caja
  ON impresoras (restaurante_id, es_caja)
  WHERE es_caja = TRUE;

-- ============================================================
-- NOTAS:
-- · La impresora marcada es_caja=true recibe el ticket de cuenta
--   cuando el camarero pulsa "Pedir cuenta".
-- · Si hay varias impresoras es_caja en el mismo restaurante,
--   se elige la que coincide con la zona de la mesa.
--   Si no hay zona, se usa la primera activa es_caja.
-- · Si no hay ninguna impresora es_caja configurada, el ticket
--   se envía a la primera impresora activa del restaurante.
-- ============================================================
