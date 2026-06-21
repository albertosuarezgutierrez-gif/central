-- ══════════════════════════════════════════════════════════
-- CARTA DE VINOS — ia.rest  (18/05/2026)
-- Añade metadata JSONB a productos + vista stats sumiller
-- ══════════════════════════════════════════════════════════

-- 1. Columna metadata en productos
ALTER TABLE productos ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN productos.metadata IS
  'Metadatos extendidos. Para vinos: { bodega, varietal, do, añada, temperatura_servicio, maridaje }';

-- Índice GIN para búsquedas rápidas por metadata
CREATE INDEX IF NOT EXISTS idx_productos_metadata ON productos USING GIN (metadata)
  WHERE metadata IS NOT NULL AND metadata != '{}';

-- 2. Vista estadísticas sommeliero
CREATE OR REPLACE VIEW v_vinos_stats AS
SELECT
  p.id,
  p.nombre,
  p.restaurante_id,
  p.metadata->>'bodega'              AS bodega,
  p.metadata->>'do'                  AS denominacion_origen,
  p.metadata->>'varietal'            AS varietal,
  p.metadata->>'añada'               AS anada,
  p.precio,
  COALESCE(SUM(ci.cantidad), 0)      AS unidades_vendidas,
  COALESCE(SUM(ci.cantidad * ci.precio_unitario), 0) AS facturado_eur,
  COUNT(DISTINCT ci.comanda_id)      AS num_comandas
FROM productos p
LEFT JOIN comanda_items ci ON ci.producto_id = p.id
WHERE (
  p.familia LIKE 'vino%'
  OR p.metadata->>'tipo' = 'vino'
  OR LOWER(p.categoria) IN ('vinos', 'vino', 'bodega', 'carta de vinos', 'vinos tintos', 'vinos blancos', 'vinos rosados', 'espumosos', 'cava', 'champagne')
)
GROUP BY p.id, p.nombre, p.restaurante_id, p.metadata, p.precio
ORDER BY unidades_vendidas DESC;
