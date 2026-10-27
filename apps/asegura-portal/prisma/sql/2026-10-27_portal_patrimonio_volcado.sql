-- Patrimonio en el portal del cliente — VOLCADO INICIAL SEMIAUTOMÁTICO (27/10/2026, hoja de ruta §7 punto 4).
-- ⏳ SIN APLICAR. Se aplica ANTES del despliegue de asegura-portal que lo usa: `schema.prisma` ya declara la columna nueva
-- de `portal_patrimonio_importacion` y, sin ella en la BD, TODA lectura del modelo revienta (42703 / 42501), también la del
-- importador CSV que ya existe. Requiere `2026-10-22_portal_patrimonio.sql`, `2026-10-26_portal_patrimonio_importacion_fichero.sql`
-- y `2026-10-27_portal_patrimonio_edificio_unidades.sql` ya aplicados (el volcado crea unidades con `inmueble_padre_id`).
-- IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de objetos (el MCP de Supabase se cuelga con ellas), ni siquiera en
-- comentarios; el CHECK se crea solo si no existe.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  · `volcado` (boolean, NOT NULL, por defecto false): la importación es un VOLCADO (la IA propone edificio/unidades,
--    contratos con inquilino y gastos fijos a partir de un Excel, PDF o foto) y no una hoja de UN tipo. Un volcado lleva
--    `tipo` NULL (CHECK): el importador CSV, que solo abre importaciones con tipo, no lo ve nunca.
--  · La propuesta vive en `portal_patrimonio_importacion_fila` como hasta ahora (entidades `inmueble`, `contrato`,
--    `plantilla_gasto`; ya admitidas por su CHECK), en tránsito: el trigger existente vacía `datos` al confirmar o descartar.
--    Del inquilino solo va el NOMBRE (nunca NIF, correo, teléfono ni IBAN: el portal los borra antes de guardar).
--  · Cada volcado creado es UNA lectura con IA: el cupo mensual del titular cuenta facturas + volcados del mes
--    (índice parcial para ese recuento).
--
-- ── Permisos ──────────────────────────────────────────────────────────────────
--  · `prisma_asegura_portal` (SIN BYPASSRLS): SELECT e INSERT de la columna nueva; nunca UPDATE (un volcado no deja de
--    serlo) ni DELETE.
--  · `crm_seguros`: REVOKE ALL (otra vez): el CRM de Manuel no lee patrimonio.
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_patrimonio_importacion
  ADD COLUMN IF NOT EXISTS volcado boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_importacion_volcado_sin_tipo') THEN
    ALTER TABLE seguros.portal_patrimonio_importacion
      ADD CONSTRAINT portal_patrimonio_importacion_volcado_sin_tipo
        CHECK (NOT volcado OR tipo IS NULL);
  END IF;
END $$;

-- Recuento del cupo de IA por titular y mes.
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_importacion_volcado_titular
  ON seguros.portal_patrimonio_importacion (titular_id, creado_en DESC)
  WHERE volcado;

-- GRANT por columnas (espejo EXACTO en schema.prisma; cepo `test/regression-portal-patrimonio-sql.test.ts`).
GRANT SELECT (volcado) ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;
GRANT INSERT (volcado) ON seguros.portal_patrimonio_importacion TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_importacion FROM crm_seguros;
REVOKE ALL ON seguros.portal_patrimonio_importacion_fila FROM crm_seguros;

COMMIT;
