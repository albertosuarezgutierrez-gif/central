-- Fase 2 (identidad de persona compartida): persona_id en rrhh.empleados.
-- Mismo persona_id (uuid) que lleva la fila de la persona en otra vertical (p.ej. ialimp.limpiadoras)
-- para tratarla como UNA sola persona. Nullable: provisión opcional al alta.
ALTER TABLE rrhh.empleados ADD COLUMN IF NOT EXISTS persona_id uuid;
CREATE INDEX IF NOT EXISTS idx_empleados_persona ON rrhh.empleados(persona_id);
