-- Registro de accesos y actividad de los usuarios de ialimp (owner, usuarios,
-- limpiadoras, propietarios). Lo escribe ialimp (logins + middleware) y lo lee
-- el god-panel de plataforma (/operador/actividad) — por eso el GRANT de
-- lectura a prisma_plataforma.
-- OJO: la tabla nace VACÍA — el historial existe solo desde el despliegue
-- (15/08/2026); «sin filas» = «sin registro», NUNCA «no ha entrado».

CREATE TABLE IF NOT EXISTS registro_actividad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid,
  actor_tipo text NOT NULL,           -- owner | usuario | limpiadora | propietario
  actor_id uuid,
  actor_nombre text,
  accion text NOT NULL,               -- login | login_forzado | pagina | accion
  metodo text,
  ruta text,
  detalle text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_registro_actividad_empresa
  ON registro_actividad (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_registro_actividad_actor
  ON registro_actividad (actor_tipo, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_registro_actividad_fecha
  ON registro_actividad (created_at);

-- Último acceso del login de empresa (dueña). NULL = anterior al despliegue
-- de esta columna («no registrado»), no «nunca ha entrado».
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ultimo_acceso timestamptz;

-- Least-privilege: ialimp escribe (y purga a 90 días); plataforma solo lee.
REVOKE ALL ON registro_actividad FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON registro_actividad TO prisma_ialimp;
GRANT SELECT ON registro_actividad TO prisma_plataforma;
