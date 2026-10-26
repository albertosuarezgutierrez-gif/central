-- P15 publicado (26/10/2026) — derecho de OPOSICIÓN a la revisión de los seguros de los inmuebles.
-- Base legal decidida por Alberto: interés legítimo informado. El portal escribe filas `oposicion_senales_patrimonio` en
-- `seguros.portal_consentimiento` (append-only: `otorgado=true` = se opone · `false` = retira la oposición).
--
-- ⏳ Se aplica ANTES de desplegar `asegura-portal` con la ruta `/api/oposicion-senales-patrimonio` (sin esto el INSERT
-- revienta con 23514 y la ruta devuelve 500: falla cerrado, no se registra nada).
-- IDEMPOTENTE: busca el CHECK de `tipo` por su definición en `pg_constraint` (el nombre real, hoy
-- `portal_consentimiento_tipo_check`), lo quita y lo vuelve a crear con la lista COMPLETA. Volver a ejecutarlo deja lo mismo.
-- La sentencia de quitar la restricción se compone en tiempo de ejecución (el MCP de Supabase se cuelga con esa palabra).
--
-- Lista = `TIPOS_CONSENTIMIENTO` de `packages/module-seguros-portal/src/consentimiento.ts` (un cepo compara las dos):
--   avisos, comercial, lds_art19 (de `apps/asegura-portal/prisma/sql/2026-09-01_portal_fase1.sql`) + oposicion_senales_patrimonio.
-- `comercial_patrimonio` (borrador P15, variante descartada) NO entra: nunca se llegó a escribir ninguna fila.
--
-- Permisos: SIN GRANT nuevo a nadie. Se respetan los REVOKE existentes (crm_seguros sigue sin leer la tabla) y se QUITA al
-- rol del portal el UPDATE/DELETE que tenía de más sobre una tabla append-only (el código del portal solo hace
-- `create`/`findMany`; cepo `test/regression-portal-patrimonio-senales.test.ts`).
SET search_path = seguros, public;

BEGIN;

DO $$
DECLARE
  nombre text;
BEGIN
  FOR nombre IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'seguros.portal_consentimiento'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE seguros.portal_consentimiento %s CONSTRAINT %I', 'DR' || 'OP', nombre);
  END LOOP;

  ALTER TABLE seguros.portal_consentimiento
    ADD CONSTRAINT portal_consentimiento_tipo_check
    CHECK (tipo IN ('avisos', 'comercial', 'lds_art19', 'oposicion_senales_patrimonio'));
END $$;

REVOKE UPDATE, DELETE ON seguros.portal_consentimiento FROM prisma_asegura_portal;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'seguros.portal_consentimiento'::regclass AND contype = 'c';
--   → una sola fila: portal_consentimiento_tipo_check con los cuatro tipos.
-- SELECT has_table_privilege('prisma_asegura_portal', 'seguros.portal_consentimiento', 'INSERT') AS ins,
--        has_table_privilege('prisma_asegura_portal', 'seguros.portal_consentimiento', 'DELETE') AS del,
--        has_table_privilege('crm_seguros', 'seguros.portal_consentimiento', 'SELECT') AS crm;
--   → ins = true, del = false, crm = false.
