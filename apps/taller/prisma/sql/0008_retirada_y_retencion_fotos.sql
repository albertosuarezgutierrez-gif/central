-- Vertical TALLER — 0008: firma de retirada del vehículo y retención de fotos (borrado automático tras el plazo).
-- Requiere 0001-0007 aplicados. IDEMPOTENTE. ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (preview → prod tras OK de Alberto).
--
--  1) Configuración editable por el dueño: firma de retirada (obligatoria o no, texto de conformidad y su versión) y
--     `fotos_retencion_dias` (alta 180, mínimo 90: la garantía legal de una reparación es de 3 meses o 2.000 km).
--     Los valores por defecto ≡ RETIRADA_ALTA y FOTOS_RETENCION_DIAS_ALTA de @central/module-taller (cepo test/esquema-sql.test.ts).
--  2) `ordenes_trabajo`: lo que se guarda al entregar (firma en Storage, texto EXACTO de conformidad, su versión y quién retira).
--     `entregado_en` ya existe desde 0001. Sin firma (taller con la firma desactivada) estas columnas quedan NULL, nunca vacías.
--  3) `recepcion_fotos` y `ot_fotos`: `purgada_en`. La purga borra el ARCHIVO de Storage y marca la fila; la fila no se borra.
--     Las firmas, el resguardo, los presupuestos y las facturas no tienen esta columna: no se purgan.
--  4) `taller.talleres_activos()`: la purga diaria (cron) recorre los talleres de uno en uno con `conTaller()`; el rol de la app
--     no puede listar `talleres` sin tener ya un taller (RLS), y esta función SECURITY DEFINER devuelve SOLO los ids.
--
--  Sin tablas nuevas, así que no hay `taller_id`/RLS nuevos que añadir. `taller.bloqueos_codigo` (0006) sigue sin `taller_id` a propósito
--  (se consulta ANTES de resolver el taller; solo IP y contadores) y esta migración no la toca.
BEGIN;

-- ─── 1. Configuración ────────────────────────────────────────────────────────
ALTER TABLE taller.configuracion
  ADD COLUMN IF NOT EXISTS fotos_retencion_dias integer NOT NULL DEFAULT 180 CHECK (fotos_retencion_dias >= 90),
  ADD COLUMN IF NOT EXISTS retirada_firma_obligatoria boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS retirada_texto_conformidad text NOT NULL DEFAULT 'Recojo el vehículo tras haberlo revisado, de conformidad con los trabajos realizados según la orden de trabajo y sin reservas sobre su estado en este momento. Sé que el taller conserva las fotografías de la recepción y de los trabajos durante el plazo de conservación indicado por el taller.'
    CHECK (length(btrim(retirada_texto_conformidad)) > 0),
  ADD COLUMN IF NOT EXISTS retirada_version_texto text NOT NULL DEFAULT 'retirada-borrador-1'
    CHECK (length(btrim(retirada_version_texto)) > 0);

-- ─── 2. Entrega ──────────────────────────────────────────────────────────────
ALTER TABLE taller.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS entrega_firma_ruta text,
  ADD COLUMN IF NOT EXISTS entrega_conformidad_texto text,
  ADD COLUMN IF NOT EXISTS entrega_conformidad_version text,
  ADD COLUMN IF NOT EXISTS entrega_retira_nombre text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ot_entrega_firma') THEN
    -- Una firma de retirada siempre va con su texto, su versión, quién retira y la fecha de entrega.
    ALTER TABLE taller.ordenes_trabajo ADD CONSTRAINT ck_ot_entrega_firma CHECK (
      entrega_firma_ruta IS NULL
      OR (entrega_conformidad_texto IS NOT NULL AND entrega_conformidad_version IS NOT NULL
          AND entrega_retira_nombre IS NOT NULL AND entregado_en IS NOT NULL));
  END IF;
END $$;

-- ─── 3. Fotos purgadas ───────────────────────────────────────────────────────
ALTER TABLE taller.recepcion_fotos ADD COLUMN IF NOT EXISTS purgada_en timestamptz;
ALTER TABLE taller.ot_fotos ADD COLUMN IF NOT EXISTS purgada_en timestamptz;
-- La purga solo mira las pendientes.
CREATE INDEX IF NOT EXISTS idx_recepcion_fotos_pendientes ON taller.recepcion_fotos (taller_id, recepcion_id) WHERE purgada_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_ot_fotos_pendientes ON taller.ot_fotos (taller_id, ot_id) WHERE purgada_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_ot_entregadas ON taller.ordenes_trabajo (taller_id, entregado_en) WHERE estado = 'entregado';

-- ─── 4. Talleres activos para el cron de purga ───────────────────────────────
CREATE OR REPLACE FUNCTION taller.talleres_activos()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = taller, pg_temp
AS $$ SELECT t.id FROM taller.talleres t WHERE t.activo ORDER BY t.id $$;
REVOKE ALL ON FUNCTION taller.talleres_activos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION taller.talleres_activos() TO prisma_taller;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'taller' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);      → 0 filas
-- SELECT has_function_privilege('prisma_taller', 'taller.talleres_activos()', 'EXECUTE');                     → true
-- SELECT fotos_retencion_dias, retirada_firma_obligatoria FROM taller.configuracion;                          → 180 / true
