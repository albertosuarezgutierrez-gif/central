-- Patrimonio en el portal del cliente — enlace INMUEBLE ↔ PÓLIZA (24/10/2026, paso P10 del plan; spec
-- `docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md` §2).
-- ⏳ SIN APLICAR. Se aplica en el MISMO paso que el despliegue de asegura-portal que lo usa (regla del portal), y
-- ANTES de ese despliegue: `schema.prisma` ya declara estas columnas y, sin ellas en la BD, TODA lectura de
-- `PortalPatrimonioInmueble` y `PortalPatrimonioInmueblePoliza` revienta (42703 / 42501).
-- Requiere `2026-10-22_portal_patrimonio.sql` ya aplicado (lo está desde el 22/10/2026).
-- IDEMPOTENTE y ADITIVA: ninguna sentencia de borrado de objetos (el MCP de Supabase se cuelga con ellas), ni
-- siquiera en comentarios; los CHECK nuevos se crean solo si no existen (bloque DO que mira `pg_constraint`).
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  1. `portal_patrimonio_inmueble_poliza.estado` (`confirmado` | `rechazado`): un «No es este» queda ESCRITO para
--     que la propuesta no reaparezca. Los dos índices únicos parciales existentes (inmueble, póliza) WHERE
--     archivado_en IS NULL siguen valiendo: UNA decisión viva por par. Cambiar de opinión = archivar y crear otra
--     (el rol solo actualiza `archivado_en`; `estado` y `origen` no se reescriben nunca).
--  2. `portal_patrimonio_inmueble_poliza.origen` (`manual` | `propuesta_refcat` | `propuesta_direccion`): para medir
--     cuánto acierta el match. El servidor solo escribe `propuesta_*` si él mismo propone ese par
--     (`origenAEscribir` de `@central/module-patrimonio`).
--  3. `portal_patrimonio_inmueble.sin_seguro_declarado_en` (+ quién): «he revisado y no tiene seguro». NULL = no
--     lo ha dicho, que NO es «no tiene». El segundo estado no puede ser una ausencia de filas.
--
-- ── Permisos ──────────────────────────────────────────────────────────────────
--  · `prisma_asegura_portal` (SIN BYPASSRLS): GRANT por COLUMNAS, sin DELETE. INSERT de `estado`/`origen` (nacen
--    con la decisión) y UPDATE solo de la declaración «no tiene seguro» del inmueble.
--  · `crm_seguros`: REVOKE ALL (otra vez, por si un GRANT de tabla se coló entre medias): el CRM de Manuel no lee
--    patrimonio.
--  · Los consentimientos `encargo_patrimonio` / `comercial_patrimonio` de la spec §2.2 NO van aquí: son del paso
--    legal (P15), junto a su texto y `VERSION_TEXTOS_LEGALES`.
SET search_path = seguros, public;

BEGIN;

-- 1-2. Enlace: estado de la decisión del cliente y de dónde salió. Las filas que ya existan (ninguna el 24/10/2026:
-- nadie usaba la tabla) quedan `confirmado` / `manual`, que es lo que eran.
ALTER TABLE seguros.portal_patrimonio_inmueble_poliza
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'confirmado',
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

-- 3. Inmueble: «he revisado y no tiene seguro».
ALTER TABLE seguros.portal_patrimonio_inmueble
  ADD COLUMN IF NOT EXISTS sin_seguro_declarado_en timestamptz,
  ADD COLUMN IF NOT EXISTS sin_seguro_declarado_por_identidad_id uuid
    REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_poliza_estado_check') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble_poliza
      ADD CONSTRAINT portal_patrimonio_inmueble_poliza_estado_check CHECK (estado IN ('confirmado', 'rechazado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_poliza_origen_check') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble_poliza
      ADD CONSTRAINT portal_patrimonio_inmueble_poliza_origen_check
        CHECK (origen IN ('manual', 'propuesta_refcat', 'propuesta_direccion'));
  END IF;
  -- Quién lo declaró solo existe si hay declaración (al revés no: la identidad puede borrarse → SET NULL).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_sin_seguro_coherente') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_sin_seguro_coherente
        CHECK (sin_seguro_declarado_en IS NOT NULL OR sin_seguro_declarado_por_identidad_id IS NULL);
  END IF;
END $$;

-- GRANT por columnas (espejo EXACTO en schema.prisma; cepo `test/regression-portal-patrimonio-sql.test.ts`).
GRANT SELECT (estado, origen) ON seguros.portal_patrimonio_inmueble_poliza TO prisma_asegura_portal;
GRANT INSERT (estado, origen) ON seguros.portal_patrimonio_inmueble_poliza TO prisma_asegura_portal;
GRANT SELECT (sin_seguro_declarado_en, sin_seguro_declarado_por_identidad_id)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT UPDATE (sin_seguro_declarado_en, sin_seguro_declarado_por_identidad_id)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_inmueble_poliza FROM crm_seguros;
REVOKE ALL ON seguros.portal_patrimonio_inmueble FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, privilege_type FROM information_schema.column_privileges
--  WHERE grantee = 'prisma_asegura_portal' AND table_schema = 'seguros'
--    AND table_name IN ('portal_patrimonio_inmueble_poliza', 'portal_patrimonio_inmueble')
--    AND column_name IN ('estado', 'origen', 'sin_seguro_declarado_en', 'sin_seguro_declarado_por_identidad_id')
--  ORDER BY 1, 2;
--   → estado INSERT/SELECT · origen INSERT/SELECT · sin_seguro_declarado_en SELECT/UPDATE · …_por_identidad_id SELECT/UPDATE
-- SELECT count(*) FROM information_schema.role_table_grants
--  WHERE grantee = 'crm_seguros' AND table_name IN ('portal_patrimonio_inmueble_poliza', 'portal_patrimonio_inmueble');  → 0
