-- Patrimonio en el portal del cliente — TOPE de actualización de renta EDITABLE por el cliente (24/10/2026, P13/P14).
-- Decisión de Alberto: el cliente puede editar el tope legal de actualización de renta de SU contrato; el valor por
-- defecto sale del catálogo por año de `@central/module-patrimonio` (`src/tope-renta.ts`), que revisa un agente fiscal.
-- ⏳ SIN APLICAR. Se aplica ANTES del despliegue de asegura-portal que lo usa: `schema.prisma` ya declara estas
-- columnas y, sin ellas en la BD, TODA lectura de `PortalPatrimonioContrato` revienta (42703 / 42501).
-- Requiere `2026-10-22_portal_patrimonio.sql` ya aplicado.
-- IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de objetos (el MCP de Supabase se cuelga con ellas), ni
-- siquiera en comentarios; el CHECK nuevo se crea solo si no existe (bloque DO que mira `pg_constraint`).
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  · `portal_patrimonio_contrato.tope_actualizacion_pct` (numeric 5,2): el tope en % que fijó el cliente. NULL = no
--    ha fijado ninguno (rige el catálogo del año del aniversario). Un 0 es un tope real, no «sin tope».
--  · `portal_patrimonio_contrato.tope_actualizacion_sin` (boolean): el cliente dijo «sin tope». NULL/false = no.
--    Coherencia: no puede haber a la vez un % propio y «sin tope».
--  · Quién y cuándo lo cambió (`tope_actualizacion_por_identidad_id`, `tope_actualizacion_en`): rastro de una decisión
--    que cambia el importe de una renta propuesta.
--
-- ── Permisos ──────────────────────────────────────────────────────────────────
--  · `prisma_asegura_portal` (SIN BYPASSRLS): SELECT y UPDATE solo de estas columnas; nunca DELETE.
--  · `crm_seguros`: REVOKE ALL (otra vez): el CRM de Manuel no lee patrimonio.
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_patrimonio_contrato
  ADD COLUMN IF NOT EXISTS tope_actualizacion_pct numeric(5, 2),
  ADD COLUMN IF NOT EXISTS tope_actualizacion_sin boolean,
  ADD COLUMN IF NOT EXISTS tope_actualizacion_por_identidad_id uuid
    REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tope_actualizacion_en timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_contrato_tope_rango') THEN
    ALTER TABLE seguros.portal_patrimonio_contrato
      ADD CONSTRAINT portal_patrimonio_contrato_tope_rango
        CHECK (tope_actualizacion_pct IS NULL OR (tope_actualizacion_pct >= 0 AND tope_actualizacion_pct <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_contrato_tope_coherente') THEN
    ALTER TABLE seguros.portal_patrimonio_contrato
      ADD CONSTRAINT portal_patrimonio_contrato_tope_coherente
        CHECK (NOT (tope_actualizacion_sin IS TRUE AND tope_actualizacion_pct IS NOT NULL));
  END IF;
END $$;

-- GRANT por columnas (espejo EXACTO en schema.prisma; cepo `test/regression-portal-patrimonio-sql.test.ts`).
GRANT SELECT (tope_actualizacion_pct, tope_actualizacion_sin, tope_actualizacion_por_identidad_id, tope_actualizacion_en)
  ON seguros.portal_patrimonio_contrato TO prisma_asegura_portal;
GRANT UPDATE (tope_actualizacion_pct, tope_actualizacion_sin, tope_actualizacion_por_identidad_id, tope_actualizacion_en)
  ON seguros.portal_patrimonio_contrato TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_contrato FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, privilege_type FROM information_schema.column_privileges
--  WHERE grantee = 'prisma_asegura_portal' AND table_schema = 'seguros' AND table_name = 'portal_patrimonio_contrato'
--    AND column_name LIKE 'tope_actualizacion%' ORDER BY 1, 2;
--   → las cuatro columnas con SELECT y UPDATE
-- SELECT count(*) FROM information_schema.role_table_grants
--  WHERE grantee = 'crm_seguros' AND table_name = 'portal_patrimonio_contrato';  → 0
