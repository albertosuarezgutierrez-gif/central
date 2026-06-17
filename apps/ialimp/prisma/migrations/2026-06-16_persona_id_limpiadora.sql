-- Fase 2 (identidad de persona compartida): persona_id en limpiadoras.
-- Permite enlazar a la MISMA persona en varias verticales (limpiadora en ialimp ↔ empleada en rrhh),
-- usando el mismo persona_id (uuid) en ambas filas. Nullable: provisión opcional al alta.
ALTER TABLE limpiadoras ADD COLUMN IF NOT EXISTS persona_id uuid;
CREATE INDEX IF NOT EXISTS idx_limpiadoras_persona ON limpiadoras(persona_id);
