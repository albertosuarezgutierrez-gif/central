-- Apellidos separados + fecha de reconocimiento médico en la ficha del empleado.
-- Estas columnas se aplicaron a mano en producción (commit 9e84f1e: "migración ya
-- aplicada") pero nunca se dejó el fichero de migración → deriva contra una BD nueva.
-- Idempotente: no-op donde ya existen.
ALTER TABLE rrhh.empleados
  ADD COLUMN IF NOT EXISTS apellidos                   TEXT,
  ADD COLUMN IF NOT EXISTS fecha_reconocimiento_medico DATE;
