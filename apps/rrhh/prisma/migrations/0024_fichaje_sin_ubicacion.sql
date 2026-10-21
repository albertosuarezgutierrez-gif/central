-- Fichar sin ubicación (emergencia) + incidencias de ubicación + precisión del GPS (21/10/2026).
-- Global2 (Pilar): los empleados no podían fichar cuando el GPS fallaba. Aditiva e idempotente.
-- 🚨 Aplicar ANTES de desplegar el código: `ficharEntrada`/`ficharSalida` escriben las columnas
-- nuevas de `rrhh.fichajes` y `/api/e/fichaje` lee `empresas.permite_fichar_sin_ubicacion`; sin
-- ellas fichar da 500.
--
-- 1) Permiso por empresa. Por defecto SÍ: el fichaje queda marcado y lo ve el responsable.
ALTER TABLE rrhh.empresas
  ADD COLUMN IF NOT EXISTS permite_fichar_sin_ubicacion boolean NOT NULL DEFAULT true;

-- 2) Marca del fichaje sin ubicación y precisión del GPS (metros, `coords.accuracy` redondeado).
--    Precisión NULL = «no se sabe» (sin ubicación o fichaje anterior a 0024), nunca 0.
ALTER TABLE rrhh.fichajes
  ADD COLUMN IF NOT EXISTS sin_ubicacion_entrada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sin_ubicacion_salida  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS precision_entrada_m   integer,
  ADD COLUMN IF NOT EXISTS precision_salida_m    integer;

ALTER TABLE rrhh.fichajes DROP CONSTRAINT IF EXISTS fichajes_precision_chk;
ALTER TABLE rrhh.fichajes ADD CONSTRAINT fichajes_precision_chk CHECK (
  (precision_entrada_m IS NULL OR precision_entrada_m BETWEEN 0 AND 100000) AND
  (precision_salida_m  IS NULL OR precision_salida_m  BETWEEN 0 AND 100000));

-- 3) Incidencias de ubicación: una fila cada vez que el móvil del empleado no da la posición.
--    Es el «aviso al responsable» (sección en /admin/fichajes): sin correo, push ni mensajes.
CREATE TABLE IF NOT EXISTS rrhh.incidencias_ubicacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id    uuid NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  causa          text NOT NULL CHECK (causa IN ('permiso','no_disponible','timeout','sin_soporte','desconocido')),
  plataforma     text NOT NULL CHECK (plataforma IN ('ios','android','otro')),
  estado_permiso text CHECK (estado_permiso IN ('granted','prompt','denied','desconocido')), -- NULL = no se supo
  user_agent     text CHECK (user_agent IS NULL OR length(user_agent) <= 300),
  fichaje_id     uuid REFERENCES rrhh.fichajes(id) ON DELETE SET NULL                      -- si acabó fichando sin ubicación
);
CREATE INDEX IF NOT EXISTS incidencias_ubicacion_empresa_idx
  ON rrhh.incidencias_ubicacion (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS incidencias_ubicacion_empleado_idx
  ON rrhh.incidencias_ubicacion (empresa_id, empleado_id, created_at DESC);

-- Igual que el resto del schema: RLS on, el backend entra con rrhh_app (BYPASSRLS).
ALTER TABLE rrhh.incidencias_ubicacion ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.incidencias_ubicacion TO rrhh_app;
