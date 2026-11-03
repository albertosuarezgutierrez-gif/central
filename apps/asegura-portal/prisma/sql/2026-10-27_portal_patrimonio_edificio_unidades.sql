-- Patrimonio en el portal del cliente — EDIFICIO SIN DIVISIÓN HORIZONTAL con UNIDADES (27/10/2026, decisión de Alberto).
-- Caso piloto: un edificio con UNA referencia catastral y 12 pisos alquilados. Prioridad: rentabilidad POR PISO.
-- ⏳ SIN APLICAR: lo aplica Alberto. Requiere `2026-10-22_portal_patrimonio.sql` ya aplicado.
--
-- 🚨 Aplícalo desde el EDITOR SQL de Supabase, NO por el MCP: un CHECK no se amplía sin quitar el viejo y el MCP se cuelga
-- con esa sentencia. Es la ÚNICA de borrado de este fichero y solo quita el CHECK viejo de `uso` (el nuevo se crea ANTES,
-- en la misma transacción: la tabla nunca se queda sin catálogo).
--
-- 🚨 SQL ANTES que el despliegue: `schema.prisma` ya declara `inmueble_padre_id`, `reparto_criterio` y `reparto_porcentaje`;
-- sin ellas en la BD, TODA lectura de `PortalPatrimonioInmueble` revienta (42703 / 42501).
--
-- ADITIVA e IDEMPOTENTE: columnas NULL nuevas (ninguna fila cambia de significado), CHECK/FK/índice solo si no existen.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────────
--  · `uso` admite 'edificio' (catálogo viejo + 'edificio'; toda fila que hoy cumple, cumple el nuevo).
--  · `inmueble_padre_id` uuid NULL: la UNIDAD cuelga del edificio. NULL = inmueble suelto (o el propio edificio).
--    FK COMPUESTA `(inmueble_padre_id, titular_id)` → `(id, titular_id)`: una unidad NO puede colgar de un edificio de OTRO
--    titular aunque el código se equivoque de id (regla 4 del SQL de patrimonio). Un solo nivel y padre = edificio: trigger.
--    La unidad NO repite la referencia catastral: la HEREDA del edificio (columna NULL; el índice único por titular+RC no
--    cambia). El portal no reasigna padres (sin UPDATE de la columna).
--  · `reparto_criterio` ('m2' | 'porcentaje', solo en un EDIFICIO): cómo se imputan sus gastos (IBI, seguro, comunes) a las
--    unidades. NULL = sin elegir → NO se reparte (la rentabilidad lo dice; nada de «a partes iguales»).
--  · `reparto_porcentaje` numeric(5,2) 0–100, solo en una UNIDAD: su parte cuando el criterio es '%'. NULL = no fijada.
--    Los m² salen de `superficie_m2` (ya existe y ya se concede).
--
-- ── Permisos ──────────────────────────────────────────────────────────────────
--  · `prisma_asegura_portal` (SIN BYPASSRLS): SELECT e INSERT de las tres; UPDATE solo de las dos de reparto. Nunca DELETE.
--  · `crm_seguros`: REVOKE ALL (otra vez).
SET search_path = seguros, public;

BEGIN;

ALTER TABLE seguros.portal_patrimonio_inmueble
  ADD COLUMN IF NOT EXISTS inmueble_padre_id  uuid,
  ADD COLUMN IF NOT EXISTS reparto_criterio   text,
  ADD COLUMN IF NOT EXISTS reparto_porcentaje numeric(5, 2);

DO $$
BEGIN
  -- Catálogo de `uso` ampliado (se crea ANTES de quitar el viejo).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_uso_catalogo_v2') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_uso_catalogo_v2
        CHECK (uso IN ('vivienda', 'local', 'oficina', 'nave', 'garaje', 'trastero', 'otro', 'edificio'));
  END IF;
  -- Una unidad no cuelga de sí misma.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_padre_distinto') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_padre_distinto
        CHECK (inmueble_padre_id IS NULL OR inmueble_padre_id <> id);
  END IF;
  -- 🚨 Mismo titular: FK compuesta contra `portal_patrimonio_inmueble_id_titular` (UNIQUE (id, titular_id)).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_padre_mismo_titular') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_padre_mismo_titular
        FOREIGN KEY (inmueble_padre_id, titular_id) REFERENCES seguros.portal_patrimonio_inmueble (id, titular_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_reparto_criterio_catalogo') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_reparto_criterio_catalogo
        CHECK (reparto_criterio IS NULL OR (reparto_criterio IN ('m2', 'porcentaje') AND uso = 'edificio'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_patrimonio_inmueble_reparto_porcentaje_rango') THEN
    ALTER TABLE seguros.portal_patrimonio_inmueble
      ADD CONSTRAINT portal_patrimonio_inmueble_reparto_porcentaje_rango
        CHECK (reparto_porcentaje IS NULL OR (reparto_porcentaje BETWEEN 0 AND 100 AND inmueble_padre_id IS NOT NULL));
  END IF;
END $$;

ALTER TABLE seguros.portal_patrimonio_inmueble DROP CONSTRAINT IF EXISTS portal_patrimonio_inmueble_uso_check;

-- Un solo nivel: el padre es un EDIFICIO que no cuelga de nada; una unidad no es un edificio; un edificio con unidades no
-- deja de serlo. Corre con el rol que escribe (lee `id`, `uso`, `inmueble_padre_id`: columnas concedidas).
CREATE OR REPLACE FUNCTION seguros.portal_patrimonio_inmueble_un_nivel() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  p_uso   text;
  p_padre uuid;
BEGIN
  IF NEW.inmueble_padre_id IS NOT NULL THEN
    IF NEW.uso = 'edificio' THEN
      RAISE EXCEPTION 'portal_patrimonio_inmueble: un edificio no cuelga de otro inmueble' USING ERRCODE = '23514';
    END IF;
    SELECT uso, inmueble_padre_id INTO p_uso, p_padre FROM seguros.portal_patrimonio_inmueble WHERE id = NEW.inmueble_padre_id;
    -- Que exista y sea del mismo titular lo exige la FK compuesta.
    IF FOUND AND (p_uso IS DISTINCT FROM 'edificio' OR p_padre IS NOT NULL) THEN
      RAISE EXCEPTION 'portal_patrimonio_inmueble: el padre tiene que ser un edificio de primer nivel' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.uso IS DISTINCT FROM 'edificio' OR NEW.inmueble_padre_id IS NOT NULL)
     AND EXISTS (SELECT 1 FROM seguros.portal_patrimonio_inmueble WHERE inmueble_padre_id = NEW.id) THEN
    RAISE EXCEPTION 'portal_patrimonio_inmueble: un edificio con unidades no deja de ser edificio' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_portal_patrimonio_inmueble_un_nivel') THEN
    CREATE TRIGGER trg_portal_patrimonio_inmueble_un_nivel
      BEFORE INSERT OR UPDATE OF uso, inmueble_padre_id ON seguros.portal_patrimonio_inmueble
      FOR EACH ROW EXECUTE FUNCTION seguros.portal_patrimonio_inmueble_un_nivel();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_inmueble_padre
  ON seguros.portal_patrimonio_inmueble (inmueble_padre_id) WHERE inmueble_padre_id IS NOT NULL AND archivado_en IS NULL;

-- GRANT por columnas (espejo EXACTO en schema.prisma; cepo `test/regression-portal-patrimonio-edificio.test.ts`).
GRANT SELECT (inmueble_padre_id, reparto_criterio, reparto_porcentaje) ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT INSERT (inmueble_padre_id, reparto_criterio, reparto_porcentaje) ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT UPDATE (reparto_criterio, reparto_porcentaje) ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;

REVOKE ALL ON seguros.portal_patrimonio_inmueble FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'seguros.portal_patrimonio_inmueble'::regclass AND (conname LIKE '%uso%' OR conname LIKE '%padre%' OR conname LIKE '%reparto%');
--   → `..._uso_catalogo_v2` (con 'edificio'), sin `..._uso_check`; `..._padre_distinto`, `..._padre_mismo_titular`, dos de reparto
-- SELECT column_name, privilege_type FROM information_schema.column_privileges
--  WHERE grantee = 'prisma_asegura_portal' AND table_schema = 'seguros' AND table_name = 'portal_patrimonio_inmueble'
--    AND column_name IN ('inmueble_padre_id', 'reparto_criterio', 'reparto_porcentaje');
--   → padre: SELECT, INSERT · reparto_*: SELECT, INSERT, UPDATE
