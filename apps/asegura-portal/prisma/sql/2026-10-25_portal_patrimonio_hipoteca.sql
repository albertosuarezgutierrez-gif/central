-- Patrimonio en el portal del cliente — «¿TIENE HIPOTECA?» del inmueble (25/10/2026).
-- ⏳ SIN APLICAR. Se aplica ANTES del despliegue de asegura-portal que lo usa: `schema.prisma` ya declara la columna
-- `hipoteca` y, sin ella en la BD, TODA lectura de `PortalPatrimonioInmueble` revienta (42703 / 42501).
-- Requiere `2026-10-22_portal_patrimonio.sql` ya aplicado. IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de
-- objetos (el MCP de Supabase se cuelga con ellas), ni siquiera en comentarios; el CHECK se crea solo si no existe.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  · No existía ningún modelo de préstamo/hipoteca en el patrimonio (solo una categoría de gasto «FINANCIACION» deducida
--    del texto de un gasto, que NO es un dato del inmueble). Se añade el mínimo: una declaración del cliente.
--  · `hipoteca` text NULL: 'si' · 'no' · 'no_se'. NULL = el cliente no lo ha dicho (que NO es «no tiene»). Solo 'si' ofrece
--    «Los seguros de hogar y vida del banco suelen poder mejorarse»; y solo si el cliente PULSA el botón se abre petición.
--  · Sin importes, banco ni fechas del préstamo: no hacen falta para la oferta y no se piden datos de más.
--
-- ── Permisos ──────────────────────────────────────────────────────────────────
--  · `prisma_asegura_portal` (SIN BYPASSRLS): SELECT/UPDATE solo de la columna nueva; nunca DELETE.
--  · `crm_seguros`: REVOKE ALL (otra vez): el CRM de Manuel no lee patrimonio.
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_patrimonio_inmueble
  ADD COLUMN IF NOT EXISTS hipoteca text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_hipoteca_catalogo') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_hipoteca_catalogo
        CHECK (hipoteca IS NULL OR hipoteca IN ('si', 'no', 'no_se'));
  END IF;
END $$;

-- GRANT por columnas (espejo EXACTO en schema.prisma; cepo `test/regression-portal-patrimonio-sql.test.ts`).
GRANT SELECT (hipoteca) ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT UPDATE (hipoteca) ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_inmueble FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, privilege_type FROM information_schema.column_privileges
--  WHERE grantee = 'prisma_asegura_portal' AND table_schema = 'seguros'
--    AND table_name = 'portal_patrimonio_inmueble' AND column_name = 'hipoteca'
--   → SELECT y UPDATE
