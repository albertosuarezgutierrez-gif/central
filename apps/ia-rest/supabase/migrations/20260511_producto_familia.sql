-- Añade campo 'familia' a productos
-- Permite agrupar productos semánticamente para BRAIN
-- Ejemplos: 'vino_tinto', 'vino_blanco', 'cerveza', 'refresco', 'postre_casero'
-- BRAIN lo usa para detectar ambigüedad y mostrar chips de selección al camarero

ALTER TABLE productos ADD COLUMN IF NOT EXISTS familia TEXT DEFAULT NULL;

-- Índice para que brain-cache lo recupere rápido agrupado
CREATE INDEX IF NOT EXISTS idx_productos_familia ON productos(restaurante_id, familia)
  WHERE familia IS NOT NULL;

COMMENT ON COLUMN productos.familia IS
  'Grupo semántico para BRAIN (ej: vino_tinto, vino_blanco, cerveza). '
  'Cuando varios productos comparten familia, BRAIN muestra chips de selección al camarero.';
