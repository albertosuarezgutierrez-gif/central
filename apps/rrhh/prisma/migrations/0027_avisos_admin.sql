-- Avisos AL RESPONSABLE (panel admin) cuando un correo de rrhh no sale (22/10/2026). NO APLICADA: la aplica Alberto.
-- Aditiva e idempotente. Motivo: el envío del código de acceso fallaba en silencio (faltaba RESEND_API_KEY)
-- y ningún empleado podía entrar sin que nadie se enterase. A diferencia de `rrhh.avisos` (que ve el
-- EMPLEADO en /e), esta tabla es SOLO del panel admin: el empleado nunca la lee.
-- NUNCA guarda el código, la clave ni el hash: solo quién, por qué canal y por qué falló.
CREATE TABLE IF NOT EXISTS rrhh.avisos_admin (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id  uuid REFERENCES rrhh.empleados(id) ON DELETE CASCADE,   -- NULL = aviso a los responsables
  tipo         text NOT NULL CHECK (tipo IN ('envio_fallido')),
  canal        text NOT NULL CHECK (canal IN ('acceso','notificacion','firma')),
  motivo       text NOT NULL CHECK (motivo IN ('sin_proveedor','error_servidor')),
  texto        text NOT NULL,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  visto_at     timestamptz                                              -- NULL = sin ver
);
-- Dedupe (6 h por empleado y canal) y listado del panel (últimos 7 días de la empresa).
CREATE INDEX IF NOT EXISTS avisos_admin_empresa_idx ON rrhh.avisos_admin (empresa_id, creado_at DESC);
CREATE INDEX IF NOT EXISTS avisos_admin_dedupe_idx  ON rrhh.avisos_admin (empresa_id, canal, empleado_id, creado_at DESC);

-- Igual que el resto del schema: RLS on, el backend entra con rrhh_app (BYPASSRLS).
ALTER TABLE rrhh.avisos_admin ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.avisos_admin TO rrhh_app;
