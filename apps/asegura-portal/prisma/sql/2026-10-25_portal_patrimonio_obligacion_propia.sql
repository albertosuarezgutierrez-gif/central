-- Patrimonio en el portal del cliente — OBLIGACIONES Y RECORDATORIOS PROPIOS del inmueble (25/10/2026).
-- El cliente (nivel Gestión o Total) crea sus propios recordatorios de un inmueble: IBI, comunidad, caldera, ITE, fin de
-- seguro… Salen en `/patrimonio/calendario`, la campana y «Pendiente de ti» igual que las derivadas de contrato.
-- ⏳ SIN APLICAR. Se aplica ANTES del despliegue de asegura-portal que lo usa: `schema.prisma` ya declara la columna
-- `categoria` y, sin ella en la BD, TODA lectura de `PortalPatrimonioObligacion` revienta (42703 / 42501).
-- Requiere `2026-10-22_portal_patrimonio.sql` ya aplicado.
-- IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de objetos (el MCP de Supabase se cuelga con ellas), ni
-- siquiera en comentarios; los CHECK nuevos se crean solo si no existen (bloque DO que mira `pg_constraint`).
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  · REUTILIZA `portal_patrimonio_obligacion` (no hay tabla nueva). Una obligación PROPIA es una fila con `categoria`
--    NO nula; el CHECK de `tipo` no se toca (no se puede ampliar sin borrar la restricción vieja): la propia lleva
--    `tipo = 'otra'` y su catálogo cerrado va en la columna nueva.
--  · `categoria` text NULL: ibi · comunidad · caldera · ite · fin_seguro · basuras · otro. NULL = obligación de siempre
--    (ITE/IEE, gas… precargadas): el portal NO las edita ni las archiva (solo las filas con `categoria`).
--  · Periodicidad: se guarda en `periodicidad_meses`: NULL = única · 1 mensual · 3 trimestral · 12 anual (en una propia).
--  · Texto libre opcional: `descripcion` (ya existía; el CHECK `otra_descrita` exige NOT NULL, así que una propia sin
--    texto guarda cadena vacía y el portal la lee como «sin texto»).
--  · Una propia SIEMPRE lleva fecha (`vence`): sin fecha no hay recordatorio.
--  · Baja = archivar (`archivado_en`); nunca se borra una fila.
--
-- ── Permisos ──────────────────────────────────────────────────────────────────
--  · `prisma_asegura_portal` (SIN BYPASSRLS): SELECT/INSERT/UPDATE solo de la columna nueva; nunca DELETE.
--  · `crm_seguros`: REVOKE ALL (otra vez): el CRM de Manuel no lee patrimonio.
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_patrimonio_obligacion
  ADD COLUMN IF NOT EXISTS categoria text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_obligacion_categoria_catalogo') THEN
    ALTER TABLE seguros.portal_patrimonio_obligacion
      ADD CONSTRAINT portal_patrimonio_obligacion_categoria_catalogo
        CHECK (categoria IS NULL OR categoria IN ('ibi', 'comunidad', 'caldera', 'ite', 'fin_seguro', 'basuras', 'otro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_obligacion_propia_coherente') THEN
    ALTER TABLE seguros.portal_patrimonio_obligacion
      ADD CONSTRAINT portal_patrimonio_obligacion_propia_coherente
        CHECK (
          categoria IS NULL
          OR (tipo = 'otra' AND vence IS NOT NULL AND aplica IS TRUE AND (periodicidad_meses IS NULL OR periodicidad_meses IN (1, 3, 12)))
        );
  END IF;
END $$;

-- GRANT por columnas (espejo EXACTO en schema.prisma; cepo `test/regression-portal-patrimonio-sql.test.ts`).
GRANT SELECT (categoria) ON seguros.portal_patrimonio_obligacion TO prisma_asegura_portal;
GRANT INSERT (categoria) ON seguros.portal_patrimonio_obligacion TO prisma_asegura_portal;
GRANT UPDATE (categoria) ON seguros.portal_patrimonio_obligacion TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_obligacion FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, privilege_type FROM information_schema.column_privileges
--  WHERE grantee = 'prisma_asegura_portal' AND table_schema = 'seguros' AND table_name = 'portal_patrimonio_obligacion'
--    AND column_name = 'categoria' ORDER BY 1, 2;
--   → SELECT, INSERT y UPDATE
-- SELECT count(*) FROM information_schema.role_table_grants
--  WHERE grantee = 'crm_seguros' AND table_name = 'portal_patrimonio_obligacion';  → 0
-- SELECT count(*) FROM seguros.portal_patrimonio_obligacion WHERE categoria IS NOT NULL;  → 0 antes de estrenar
