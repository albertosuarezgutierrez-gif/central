-- CONTABILIDAD F2 — avisos (campana de la cabecera) + función para el cron diario.
-- Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md §7ter (avisos). Requiere 0001 aplicada.
--
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` tras 0001 (preview → producción tras OK de Alberto). NO es idempotente en la tabla
--    (CREATE TABLE sin IF NOT EXISTS): se aplica UNA vez. Mientras no esté aplicada, la app sigue funcionando: la campana y el cron
--    fallan en silencio (la cabecera cuenta 0; el cron responde 500 sin tocar nada).
--
-- Plantillas sectoriales: son DATOS en el paquete `@central/module-contabilidad` (fuente única de verdad, con test). NO hay tabla
-- espejo: dos copias acabarían divergiendo. Las reglas EDITADAS por la empresa viven en `reglas_asiento` (0001, versionada).
--
-- Diseño:
--   · `avisos`: una fila por (empresa, clave). La clave deduplica (el mismo vencimiento/umbral no se avisa dos veces).
--     Solo se puede MARCAR COMO LEÍDO (leido_en / leido_por); el resto es inmutable y nunca se borra.
--   · RLS ENABLE + FORCE por empresa, como el resto. Permisos mínimos: SELECT, INSERT y UPDATE solo de las dos columnas de lectura.
--   · `empresas_activas()`: el cron diario no tiene empresa fijada; devuelve SOLO ids de empresas activas (SECURITY DEFINER,
--     search_path fijo, sin PUBLIC). Después el cron abre UNA transacción RLS por empresa: nunca una consulta cruzada.

BEGIN;

CREATE TABLE contabilidad.avisos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  clave           text NOT NULL CHECK (btrim(clave) <> '' AND length(clave) <= 200),
  tipo            text NOT NULL CHECK (tipo IN ('fiscal', 'ventas', 'margen', 'tesoreria', 'hechos', 'efectivo')),
  severidad       text NOT NULL CHECK (severidad IN ('info', 'aviso', 'alerta')),
  titulo          text NOT NULL CHECK (btrim(titulo) <> ''),
  detalle         text NOT NULL,
  fecha_ref       date,
  enlace          text CHECK (enlace IS NULL OR enlace ~ '^/[a-z0-9/_-]*$'),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  leido_en        timestamptz,
  leido_por       uuid,
  UNIQUE (empresa_id, clave),
  CHECK ((leido_en IS NULL) = (leido_por IS NULL) OR leido_por IS NULL)
);
CREATE INDEX idx_avisos_sin_leer ON contabilidad.avisos (empresa_id, creado_en DESC) WHERE leido_en IS NULL;

-- Solo cambian leido_en / leido_por (y solo de NULL a valor); nada se borra.
CREATE OR REPLACE FUNCTION contabilidad.avisos_solo_lectura() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contabilidad.avisos no se borra';
  END IF;
  IF NEW.id <> OLD.id OR NEW.empresa_id <> OLD.empresa_id OR NEW.clave <> OLD.clave OR NEW.tipo <> OLD.tipo
     OR NEW.severidad <> OLD.severidad OR NEW.titulo <> OLD.titulo OR NEW.detalle <> OLD.detalle
     OR NEW.fecha_ref IS DISTINCT FROM OLD.fecha_ref OR NEW.enlace IS DISTINCT FROM OLD.enlace OR NEW.creado_en <> OLD.creado_en THEN
    RAISE EXCEPTION 'el contenido del aviso % es inmutable', OLD.id;
  END IF;
  IF OLD.leido_en IS NOT NULL AND NEW.leido_en IS DISTINCT FROM OLD.leido_en THEN
    RAISE EXCEPTION 'el aviso % ya estaba leído', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_avisos_solo_lectura
  BEFORE UPDATE OR DELETE ON contabilidad.avisos
  FOR EACH ROW EXECUTE FUNCTION contabilidad.avisos_solo_lectura();
CREATE TRIGGER trg_avisos_sin_truncate
  BEFORE TRUNCATE ON contabilidad.avisos
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();

ALTER TABLE contabilidad.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.avisos FORCE ROW LEVEL SECURITY;
CREATE POLICY avisos_por_empresa ON contabilidad.avisos
  USING (empresa_id = contabilidad.empresa_actual()) WITH CHECK (empresa_id = contabilidad.empresa_actual());

GRANT SELECT, INSERT ON contabilidad.avisos TO prisma_contabilidad;
GRANT UPDATE (leido_en, leido_por) ON contabilidad.avisos TO prisma_contabilidad;
REVOKE DELETE, TRUNCATE ON contabilidad.avisos FROM prisma_contabilidad;

-- Empresas activas para el cron (sin empresa fijada). Solo ids: ningún dato contable.
CREATE OR REPLACE FUNCTION contabilidad.empresas_activas() RETURNS TABLE (o_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$ SELECT e.id FROM contabilidad.empresas e WHERE e.activo ORDER BY e.id $$;
REVOKE ALL ON FUNCTION contabilidad.empresas_activas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contabilidad.empresas_activas() TO prisma_contabilidad;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────────────────────────────────────────
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'contabilidad.avisos'::regclass;           → t, t
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.avisos', 'DELETE');                            → false
-- SELECT has_column_privilege('prisma_contabilidad', 'contabilidad.avisos', 'titulo', 'UPDATE');                 → false
