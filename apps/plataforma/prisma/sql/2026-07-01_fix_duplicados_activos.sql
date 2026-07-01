-- Marcar como ignorado los duplicados activos detectados el 2026-07-01
-- Conserva el registro más antiguo (menor created_at) de cada grupo
UPDATE movimientos_bancarios
SET duplicado_estado = 'ignorado'
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY cuenta_bancaria_id, fecha_operacion, importe ORDER BY created_at ASC) as rn
    FROM movimientos_bancarios
    WHERE COALESCE(duplicado_estado, '') <> 'ignorado'
  ) ranked
  WHERE rn > 1
);
