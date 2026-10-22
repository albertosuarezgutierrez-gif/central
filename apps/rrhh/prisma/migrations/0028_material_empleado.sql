-- Material del empleado: foto de EPIs / herramientas / maquinaria que tiene cada trabajador (22/10/2026).
-- Global2 (Pilar, RRHH): el empleado hace una foto desde /e y la sube con tipo, nombre corto y nota;
-- Pilar la revisa en /admin/material y pone el estado. La revisión periódica queda para más adelante.
-- Aditiva e idempotente. NO APLICADA: la aplica Alberto.
-- 🚨 Aplicar ANTES de desplegar el código: `/api/e/material` y `/api/admin/material` leen/escriben
-- `rrhh.material_empleado`; sin la tabla dan 500 (la sección «Mi material» de /e muestra el error, el
-- resto del portal sigue funcionando).
--
-- Fotos en el bucket PRIVADO `rrhh-documentos`, path `material/<empresa_id>/<empleado_id>/<uuid>.<ext>`
-- (sin datos personales en el nombre). Solo se sirven con URL firmada de 1 h.
-- `estado_nota` / `revisado_por` / `revisado_at` NULL = aún no revisado por RRHH (no «sin nota»).
-- `borrado_at` NULL = vivo. El empleado solo puede borrar (lógico) lo suyo mientras siga `pendiente`.
CREATE TABLE IF NOT EXISTS rrhh.material_empleado (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id   uuid NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('epi','herramienta','maquinaria','otro')),
  nombre        text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  nota          text CHECK (nota IS NULL OR length(nota) <= 500),
  foto_path     text NOT NULL,
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','revisado','falta_roto','devuelto')),
  estado_nota   text CHECK (estado_nota IS NULL OR length(estado_nota) <= 500),
  revisado_por  uuid REFERENCES rrhh.usuarios_rrhh(id) ON DELETE SET NULL,
  revisado_at   timestamptz,
  creado_at     timestamptz NOT NULL DEFAULT now(),
  borrado_at    timestamptz
);

-- Lista del empleado y ficha del empleado en el panel.
CREATE INDEX IF NOT EXISTS material_empleado_emp_idx
  ON rrhh.material_empleado (empresa_id, empleado_id, creado_at DESC);
-- Panel /admin/material (toda la empresa, filtrable por estado).
CREATE INDEX IF NOT EXISTS material_empleado_empresa_idx
  ON rrhh.material_empleado (empresa_id, estado, creado_at DESC);

-- Igual que el resto del schema: RLS on, el backend entra con rrhh_app (BYPASSRLS).
-- El aislamiento por empresa/empleado lo da el CÓDIGO (`lib/material-repo.ts`).
ALTER TABLE rrhh.material_empleado ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON rrhh.material_empleado TO rrhh_app;
