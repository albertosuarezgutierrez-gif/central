-- Enlace de acceso directo del correo de avisos de la intranet (24/09/2026). Un token largo de UN
-- SOLO USO y 24 h: se guarda solo su SHA-256, y además el correo con el que se canjea tiene que
-- casar con el índice ciego del correo de la ficha a la que se mandó. Lo crea asegura (el cron de
-- avisos, que tiene el correo en claro) y lo canjea el portal (`/api/acceso/verificar`).
CREATE TABLE IF NOT EXISTS seguros.portal_enlace_directo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id     uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id        uuid NOT NULL REFERENCES seguros.clientes (id),
  email_lookup_hash text NOT NULL,
  token_hash        text NOT NULL,
  destino           text NOT NULL,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  expira_en         timestamptz NOT NULL,
  usado_en          timestamptz,
  CONSTRAINT portal_enlace_directo_token_unico UNIQUE (token_hash),
  CONSTRAINT portal_enlace_directo_hash_sha256 CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- Solo una ruta interna del portal: el enlace no puede ser un redirector a otro sitio.
  CONSTRAINT portal_enlace_directo_destino_interno CHECK (destino ~ '^/[^/\\]' OR destino = '/'),
  CONSTRAINT portal_enlace_directo_caduca CHECK (expira_en > creado_en AND expira_en <= creado_en + interval '7 days')
);
CREATE INDEX IF NOT EXISTS idx_portal_enlace_directo_expira ON seguros.portal_enlace_directo (expira_en);

-- 🚨 Los privilegios por defecto del schema dan DML a `crm_seguros` (el CRM de Manuel) y lectura a
-- `backup_seguros`. Con INSERT aquí, quien tenga esa credencial fabrica una llave para el correo de
-- cualquier cliente y abre su sesión: se revoca TODO y se concede solo lo que usa el cron.
REVOKE ALL ON seguros.portal_enlace_directo FROM crm_seguros;
REVOKE ALL ON seguros.portal_enlace_directo FROM backup_seguros;
REVOKE ALL ON seguros.portal_enlace_directo FROM prisma_seguros;
GRANT SELECT, INSERT, DELETE ON seguros.portal_enlace_directo TO prisma_seguros;
-- El portal solo lee y marca el uso: ni crea llaves ni las borra.
GRANT SELECT (id, email_lookup_hash, token_hash, destino, expira_en, usado_en) ON seguros.portal_enlace_directo TO prisma_asegura_portal;
GRANT UPDATE (usado_en) ON seguros.portal_enlace_directo TO prisma_asegura_portal;
