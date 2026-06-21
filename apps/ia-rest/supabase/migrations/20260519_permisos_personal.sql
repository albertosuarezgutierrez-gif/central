-- ══════════════════════════════════════════════════════════════
-- PERMISOS PERSONAL — ia.rest (19/05/2026)
-- Añade puede_comandar y modulos_gestion a camareros
-- puede_comandar: jefe_sala puede cambiar a modo /edge
-- modulos_gestion: módulos de backoffice accesibles (JSONB array)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE camareros
  ADD COLUMN IF NOT EXISTS puede_comandar   BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modulos_gestion  JSONB    NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN camareros.puede_comandar  IS
  'Si true, el usuario ve botón de cambio a modo camarero (/edge) en su interfaz';
COMMENT ON COLUMN camareros.modulos_gestion IS
  'Array de módulos de backoffice: ["almacen","rrhh","reservas","contabilidad","analytics","carta","escaner"]';

-- Índice para búsquedas por módulo
CREATE INDEX IF NOT EXISTS idx_camareros_modulos
  ON camareros USING GIN (modulos_gestion)
  WHERE modulos_gestion != '[]'::jsonb;
