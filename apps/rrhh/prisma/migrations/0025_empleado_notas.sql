-- Notas internas del responsable en la ficha del empleado (21/10/2026).
-- Pilar (RRHH): texto libre por empleado, SOLO para la empresa. Aditiva e idempotente.
-- 🚨 Aplicar ANTES de desplegar el código: `PATCH /api/admin/empleados/[id]` y la ficha
-- `/admin/empleados/[id]` leen/escriben `rrhh.empleados.notas`; sin la columna dan 500.
-- Las notas NUNCA salen en `/api/e/*` ni `/e/*` (el portal del empleado no las proyecta).
--
-- NULL = sin notas (nunca cadena vacía: la API recorta y guarda NULL si queda vacío).
ALTER TABLE rrhh.empleados
  ADD COLUMN IF NOT EXISTS notas text;

ALTER TABLE rrhh.empleados DROP CONSTRAINT IF EXISTS empleados_notas_chk;
ALTER TABLE rrhh.empleados ADD CONSTRAINT empleados_notas_chk CHECK (
  notas IS NULL OR length(notas) <= 5000);
