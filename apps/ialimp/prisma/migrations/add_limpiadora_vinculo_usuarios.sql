-- =====================================================================
-- Migración: usuarios_empresa → vinculación con limpiadoras
-- Un usuario del panel puede tener módulo 'limpiadora' y acceder a /l con PIN
-- =====================================================================

-- 1. Añadir campos a usuarios_empresa
ALTER TABLE usuarios_empresa
  ADD COLUMN IF NOT EXISTS limpiadora_id UUID REFERENCES limpiadoras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pin_hash      TEXT;

-- Índice para búsqueda por PIN en login de /l
CREATE INDEX IF NOT EXISTS idx_ue_pin_hash ON usuarios_empresa(pin_hash)
  WHERE pin_hash IS NOT NULL;

-- PIN único por empresa (solo entre usuarios que tienen PIN)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ue_pin_empresa
  ON usuarios_empresa(empresa_id, pin_hash)
  WHERE pin_hash IS NOT NULL;

COMMENT ON COLUMN usuarios_empresa.limpiadora_id IS
  'Si tiene módulo limpiadora, apunta a la fila en limpiadoras para /l';
COMMENT ON COLUMN usuarios_empresa.pin_hash IS
  'PIN hasheado (SHA-256) para login en /l. Solo si módulo limpiadora activo.';
