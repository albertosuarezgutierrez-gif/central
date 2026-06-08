-- Migración: añadir 'pendiente_confirmacion' al CHECK de comandas.estado
-- Necesario para el flujo de confirmación por voz:
--   transcribe crea la comanda en 'pendiente_confirmacion' (sin print_jobs)
--   confirmar PATCH cambia a 'en_cocina' y crea los print_jobs
--   cancelar PATCH (ya existe) cancela la comanda

DO $$
BEGIN
  ALTER TABLE comandas DROP CONSTRAINT IF EXISTS comandas_estado_check;
  ALTER TABLE comandas ADD CONSTRAINT comandas_estado_check
    CHECK (estado IN (
      'nueva',
      'en_cocina',
      'lista',
      'entregada',
      'cancelada',
      'cerrada',
      'pendiente_confirmacion'
    ));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'No se pudo actualizar el CHECK: %', SQLERRM;
END $$;
