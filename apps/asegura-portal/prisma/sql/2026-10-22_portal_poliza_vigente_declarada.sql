-- Portal de Grupo ASegura — «¿sigue vigente esta póliza?» contestado por el cliente (22/10/2026).
--
-- ✅ APLICADA el 22/10/2026 (proyecto central). 🚨 Se aplica ANTES del despliegue de asegura-portal que la usa: su
-- `schema.prisma` ya declara `vigente_declarada`, y sin la columna CUALQUIER consulta a
-- `portal_poliza_declarada` cae con 42703 (bóveda, hoja QR, partes, calendario). Es ADITIVA:
-- el código viejo sigue funcionando sobre ella. `apps/asegura` NO la declara (su modelo es un
-- subconjunto por columnas, `prisma_seguros` lee por GRANT de columna): no le afecta el orden.
--
-- ── Qué guarda ───────────────────────────────────────────────────────────────
-- La RESPUESTA del cliente a «¿sigue vigente?», tres valores y NULL:
--   NULL      = no se le ha preguntado / no contestó (todas las filas anteriores). NO es «sí».
--   'si'      = dice que la sigue teniendo.
--   'no'      = dice que ya no la tiene → `PATCH /api/polizas/[id]` la QUITA de la bóveda por el
--               mismo borrado lógico que el DELETE (`eliminada_en`, historial, partes congelados,
--               obligaciones apartadas). Nunca DELETE físico.
--   'no_sabe' = contestó «no lo sé». Es una respuesta, no un hueco: ≠ NULL.
-- Al SUBIR no se pregunta (Alberto, 22/10/2026: si la sube es que la tiene); la pregunta llegará
-- con el vencimiento. Restaurar una quitada con 'no' vuelve a NULL (ya no es verdad que «no»).
--
-- ── GRANTs ───────────────────────────────────────────────────────────────────
-- · `prisma_asegura_portal` tiene grant de TABLA (`2026-09-02_portal_rol_vinculo_grants.sql`): la
--   columna queda cubierta sola. Se repite por columna por si se revocara el de tabla (idempotente,
--   no amplía nada; mismo patrón que `2026-10-10_declaradas_borrado_logico.sql`).
-- · `prisma_seguros` lee POR COLUMNAS (`2026-09-07_portal_declarada_titular.sql`): se le da SELECT
--   para que la correduría pueda leerla cuando la declare; hoy no la lee.
-- · Columna en tabla existente: no hay REVOKE a `crm_seguros` que añadir (no es tabla `portal_*` nueva).

SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_poliza_declarada
  ADD COLUMN IF NOT EXISTS vigente_declarada text;

ALTER TABLE seguros.portal_poliza_declarada
  DROP CONSTRAINT IF EXISTS portal_poliza_vigente_declarada_valida;
ALTER TABLE seguros.portal_poliza_declarada
  ADD CONSTRAINT portal_poliza_vigente_declarada_valida
  CHECK (vigente_declarada IS NULL OR vigente_declarada IN ('si', 'no', 'no_sabe'));

COMMENT ON COLUMN seguros.portal_poliza_declarada.vigente_declarada IS
  'Respuesta del cliente a «¿sigue vigente?»: si | no | no_sabe. NULL = no preguntado / no contestado (NO es «si»). «no» va junto a eliminada_en (borrado logico).';

GRANT SELECT (vigente_declarada), UPDATE (vigente_declarada)
  ON seguros.portal_poliza_declarada TO prisma_asegura_portal;
GRANT SELECT (vigente_declarada)
  ON seguros.portal_poliza_declarada TO prisma_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
--  WHERE table_schema = 'seguros' AND table_name = 'portal_poliza_declarada' AND column_name = 'vigente_declarada';
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'portal_poliza_vigente_declarada_valida';
-- SELECT has_column_privilege('prisma_asegura_portal', 'seguros.portal_poliza_declarada', 'vigente_declarada', 'UPDATE');
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- 🚨 Primero se REVIERTE EL CÓDIGO (el schema.prisma que la declara): quitar la columna con el
-- código nuevo desplegado tumba toda lectura de declaradas con 42703. Las quitadas por «no» siguen
-- quitadas (lo hace `eliminada_en`, no esta columna).
--   ALTER TABLE seguros.portal_poliza_declarada DROP CONSTRAINT IF EXISTS portal_poliza_vigente_declarada_valida;
--   ALTER TABLE seguros.portal_poliza_declarada DROP COLUMN IF EXISTS vigente_declarada;
