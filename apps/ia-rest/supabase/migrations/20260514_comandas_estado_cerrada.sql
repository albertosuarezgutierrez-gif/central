-- Fix: añadir 'cerrada' y 'lista' al CHECK de comandas.estado
-- El código en factura/cerrar y cuenta-nominal ya usa 'cerrada'
-- La BD en producción ya tiene este fix aplicado manualmente

-- Drop y recrear el CHECK constraint (idempotente)
DO $$
BEGIN
  -- Borrar constraint existente si existe
  ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_estado_check;
  -- Recrear con todos los valores válidos
  ALTER TABLE comandas ADD CONSTRAINT comandas_estado_check
    CHECK (estado IN ('nueva','en_cocina','lista','entregada','cancelada','cerrada'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'CHECK ya existe o no se pudo modificar: %', SQLERRM;
END $$;
