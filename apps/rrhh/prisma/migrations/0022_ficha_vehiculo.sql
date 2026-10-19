-- Vehículo del empleado en la ficha (un solo coche por empleado): descripción libre y matrícula.
-- Aditiva e idempotente: no-op donde ya existen. Opcionales (NULL = no se sabe / no tiene).
ALTER TABLE rrhh.empleados
  ADD COLUMN IF NOT EXISTS coche     TEXT,
  ADD COLUMN IF NOT EXISTS matricula TEXT;
