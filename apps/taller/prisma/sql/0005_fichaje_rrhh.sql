-- Fichaje desde el taller hacia RR.HH. (04/11/2026). Aditiva e idempotente. NO aplicada a la BD real desde el código.
--   · usuarios_taller.rrhh_identificador: NIF o id de empleado en rrhh. Lo edita el DUEÑO en Ajustes > Personal. NULL = «sin vincular».
--   · talleres.rrhh_empresa_id: empresa de este taller en rrhh (uuid). El taller NUNCA lee rrhh: solo le ENVÍA el fichaje.
BEGIN;
ALTER TABLE taller.usuarios_taller ADD COLUMN IF NOT EXISTS rrhh_identificador text;
ALTER TABLE taller.usuarios_taller DROP CONSTRAINT IF EXISTS usuarios_taller_rrhh_identificador_chk;
ALTER TABLE taller.usuarios_taller ADD CONSTRAINT usuarios_taller_rrhh_identificador_chk
  CHECK (rrhh_identificador IS NULL OR (btrim(rrhh_identificador) <> '' AND length(rrhh_identificador) <= 64));
ALTER TABLE taller.talleres ADD COLUMN IF NOT EXISTS rrhh_empresa_id uuid;
-- `talleres` solo se actualiza por columnas (0002): se concede la nueva.
GRANT UPDATE (rrhh_empresa_id) ON taller.talleres TO prisma_taller;
COMMIT;
