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

-- Grants (migración `ayudas_grants_verticales`, aplicada 15/08/2026): los roles de las
-- verticales de cliente solo LEEN; plataforma además descarta (UPDATE) e inserta.
-- OJO: prisma_ialimp es least-privilege — una tabla nueva sin GRANT da `permission denied`.
GRANT SELECT ON fiscal_ayudas, ayudas_perfiles TO prisma_ialimp, prisma_almacen;
GRANT SELECT, INSERT, UPDATE ON fiscal_ayudas TO prisma_plataforma;
GRANT SELECT ON ayudas_perfiles TO prisma_plataforma;
