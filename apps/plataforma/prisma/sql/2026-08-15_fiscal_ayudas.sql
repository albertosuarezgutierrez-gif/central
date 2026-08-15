-- Radar de ayudas/subvenciones (skill fiscal-novedades, Paso 5): convocatorias con plazo
-- que encajan con el perfil. tenant NULL = Alberto (las del banner de /finanzas);
-- con valor = radar por cliente (solo informativo, no se pinta en /finanzas).
-- APLICADA en Supabase el 15/08/2026 (migración `fiscal_ayudas`).
CREATE TABLE IF NOT EXISTS fiscal_ayudas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  organismo text,
  cuantia_texto text,
  encaje text,
  url text,
  plazo_fin date, -- NULL = plazo no publicado todavía (se pinta como «plazo por confirmar», no se oculta)
  tenant text,
  descartado boolean NOT NULL DEFAULT false,
  detectado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_ayudas_visibles ON fiscal_ayudas (descartado, plazo_fin);
REVOKE ALL ON fiscal_ayudas FROM anon, authenticated;

-- Grants (migraciones `ayudas_grants_verticales` + `ayudas_revoke_write_verticales`,
-- aplicadas 15/08/2026): los roles de las verticales solo LEEN; plataforma además
-- descarta (UPDATE) e inserta en fiscal_ayudas; escribe el radar (postgres).
-- OJO doble: prisma_ialimp es least-privilege (tabla nueva sin GRANT = permission denied),
-- pero los DEFAULT PRIVILEGES de la BD daban DML completo a todos los prisma_* sobre las
-- tablas nuevas — hubo que REVOKE explícito (verificado con has_table_privilege).
GRANT SELECT ON fiscal_ayudas, ayudas_perfiles TO prisma_ialimp, prisma_almacen, prisma_plataforma;
GRANT INSERT, UPDATE ON fiscal_ayudas TO prisma_plataforma;
REVOKE INSERT, UPDATE, DELETE ON fiscal_ayudas, ayudas_perfiles
  FROM prisma_ialimp, prisma_almacen, prisma_sivra, prisma_alquiler, prisma_transporte;
REVOKE INSERT, UPDATE, DELETE ON ayudas_perfiles FROM prisma_plataforma;
