-- CONTABILIDAD F4 — impuestos: declaraciones (303, 390, 111, 115, 190, 180, 347, 349, 130) como BORRADORES revisables.
-- Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md F4 y §7ter. Requiere 0001 (y 0003 para leer facturas recibidas en la app).
--
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` tras 0003 (preview → producción tras OK de Alberto). NO es idempotente en la tabla
--    (CREATE TABLE sin IF NOT EXISTS): se aplica UNA vez. Mientras no esté aplicada la pantalla Impuestos lo dice en vez de romper
--    (cada acceso va en su propia transacción y a prueba de fallos).
--
-- Diseño:
--   · UNA fila por (empresa, modelo, ejercicio, periodo, versión). Versión 1 = la original; 2+ = COMPLEMENTARIAS (solo si la anterior está
--     presentada). `calculo` es el SNAPSHOT del cálculo (casillas con su origen, avisos, no soportado): lo que se revisó y se presentó es
--     exactamente lo que se asienta; `calculo_huella` = SHA-256 del snapshot canónico.
--   · Ciclo: borrador → revisado → presentado. Revisado puede volver a borrador (cambian los datos); presentado es DEFINITIVO.
--     Un cálculo con casos NO soportados (prorrata, recargo de equivalencia…) tiene `completo = false` y nunca sale de borrador.
--   · Presentado = presentado MANUALMENTE por el titular o su gestor con certificado digital: aquí solo se guarda la fecha y el justificante
--     como REFERENCIA DE TEXTO (nunca el fichero). Esta base de datos no envía nada a la AEAT.
--   · El contenido del cálculo solo cambia mientras sea borrador. Nada se borra (ni DELETE ni TRUNCATE).
--   · RLS ENABLE + FORCE por empresa, permisos mínimos, importes en céntimos (bigint), sin float.

BEGIN;

CREATE TABLE contabilidad.declaraciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  modelo          text NOT NULL CHECK (modelo IN ('303', '390', '111', '115', '190', '180', '347', '349', '130')),
  anio            integer NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  periodo         text NOT NULL CHECK (periodo IN ('1T', '2T', '3T', '4T', '0A')),
  version         smallint NOT NULL DEFAULT 1 CHECK (version >= 1),
  estado          text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'revisado', 'presentado')),
  -- Resultado de la autoliquidación (+ a ingresar, − a compensar/devolver). NULL = no calculable o modelo informativo.
  resultado_cent  bigint,
  -- false = el cálculo contiene casos NO soportados (prorrata, recargo de equivalencia…): no puede revisarse ni presentarse.
  completo        boolean NOT NULL,
  calculo         jsonb NOT NULL CHECK (jsonb_typeof(calculo) = 'object'),
  calculo_huella  text NOT NULL CHECK (calculo_huella ~ '^[0-9a-f]{64}$'),
  calculado_por   uuid,
  calculado_en    timestamptz NOT NULL DEFAULT now(),
  revisado_por    uuid,
  revisado_en     timestamptz,
  presentado_por  uuid,
  -- Fecha en que el titular/gestor presentó el modelo y referencia (texto) de su justificante. Nunca el fichero.
  presentado_el   date,
  justificante    text CHECK (justificante IS NULL OR length(btrim(justificante)) BETWEEN 3 AND 60),
  presentado_en   timestamptz,
  asiento_liquidacion_id uuid,
  asiento_pago_id        uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  UNIQUE (empresa_id, modelo, anio, periodo, version),
  -- Anuales ↔ periodo 0A; el resto, trimestrales.
  CHECK ((modelo IN ('390', '190', '180', '347')) = (periodo = '0A')),
  CHECK ((estado = 'borrador') = (revisado_en IS NULL)),
  CHECK ((estado = 'presentado') = (presentado_el IS NOT NULL AND justificante IS NOT NULL AND presentado_en IS NOT NULL)),
  CHECK (estado = 'borrador' OR completo),
  FOREIGN KEY (empresa_id, asiento_liquidacion_id) REFERENCES contabilidad.asientos (empresa_id, id),
  FOREIGN KEY (empresa_id, asiento_pago_id) REFERENCES contabilidad.asientos (empresa_id, id)
);
CREATE INDEX idx_declaraciones_periodo ON contabilidad.declaraciones (empresa_id, anio DESC, modelo, periodo);

-- Complementaria (versión > 1): solo si la versión anterior ya está presentada.
CREATE OR REPLACE FUNCTION contabilidad.declaraciones_version_valida() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado <> 'borrador' THEN
    RAISE EXCEPTION 'una declaración nace siempre en borrador';
  END IF;
  IF NEW.version > 1 AND NOT EXISTS (
       SELECT 1 FROM contabilidad.declaraciones d
        WHERE d.empresa_id = NEW.empresa_id AND d.modelo = NEW.modelo AND d.anio = NEW.anio AND d.periodo = NEW.periodo
          AND d.version = NEW.version - 1 AND d.estado = 'presentado') THEN
    RAISE EXCEPTION 'la complementaria % de % % % exige la versión anterior presentada', NEW.version, NEW.modelo, NEW.anio, NEW.periodo;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_declaraciones_version
  BEFORE INSERT ON contabilidad.declaraciones
  FOR EACH ROW EXECUTE FUNCTION contabilidad.declaraciones_version_valida();

-- Ciclo de vida: identidad inmutable; el cálculo solo cambia en borrador→borrador; transiciones borrador→revisado, revisado→borrador y
-- revisado→presentado; presentado es definitivo; nada se borra.
CREATE OR REPLACE FUNCTION contabilidad.declaraciones_ciclo() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contabilidad.declaraciones no se borra: una corrección es una complementaria';
  END IF;
  IF NEW.id <> OLD.id OR NEW.empresa_id <> OLD.empresa_id OR NEW.modelo <> OLD.modelo OR NEW.anio <> OLD.anio
     OR NEW.periodo <> OLD.periodo OR NEW.version <> OLD.version OR NEW.creado_en <> OLD.creado_en THEN
    RAISE EXCEPTION 'la identidad de la declaración % es inmutable', OLD.id;
  END IF;
  IF OLD.estado = 'presentado' THEN
    RAISE EXCEPTION 'la declaración % está presentada: se corrige con una complementaria', OLD.id;
  END IF;
  IF NEW.estado <> OLD.estado AND NOT ((OLD.estado = 'borrador' AND NEW.estado = 'revisado')
                                    OR (OLD.estado = 'revisado' AND NEW.estado IN ('borrador', 'presentado'))) THEN
    RAISE EXCEPTION 'transición no permitida: % → %', OLD.estado, NEW.estado;
  END IF;
  IF OLD.estado <> 'borrador' AND (NEW.calculo <> OLD.calculo OR NEW.calculo_huella <> OLD.calculo_huella
                                   OR NEW.resultado_cent IS DISTINCT FROM OLD.resultado_cent OR NEW.completo <> OLD.completo) THEN
    RAISE EXCEPTION 'el cálculo de la declaración % solo cambia mientras es borrador', OLD.id;
  END IF;
  IF OLD.estado = 'borrador' AND NEW.estado <> 'borrador' AND NEW.estado <> 'revisado' THEN
    RAISE EXCEPTION 'un borrador se revisa antes de presentarse';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_declaraciones_ciclo
  BEFORE UPDATE OR DELETE ON contabilidad.declaraciones
  FOR EACH ROW EXECUTE FUNCTION contabilidad.declaraciones_ciclo();
CREATE TRIGGER trg_declaraciones_sin_truncate
  BEFORE TRUNCATE ON contabilidad.declaraciones
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();
CREATE TRIGGER trg_declaraciones_actualizado_en
  BEFORE UPDATE ON contabilidad.declaraciones
  FOR EACH ROW EXECUTE FUNCTION contabilidad.tocar_actualizado_en();

-- RLS ENABLE + FORCE por empresa.
ALTER TABLE contabilidad.declaraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE contabilidad.declaraciones FORCE ROW LEVEL SECURITY;
CREATE POLICY declaraciones_por_empresa ON contabilidad.declaraciones
  USING (empresa_id = contabilidad.empresa_actual()) WITH CHECK (empresa_id = contabilidad.empresa_actual());

-- Permisos MÍNIMOS: leer, insertar y actualizar SOLO las columnas del ciclo. Nunca DELETE ni TRUNCATE.
GRANT SELECT, INSERT ON contabilidad.declaraciones TO prisma_contabilidad;
GRANT UPDATE (estado, resultado_cent, completo, calculo, calculo_huella, calculado_por, calculado_en, revisado_por, revisado_en,
              presentado_por, presentado_el, justificante, presentado_en, asiento_liquidacion_id, asiento_pago_id, actualizado_en)
  ON contabilidad.declaraciones TO prisma_contabilidad;
REVOKE DELETE, TRUNCATE ON contabilidad.declaraciones FROM prisma_contabilidad;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────────────────────────────────────────
-- SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'contabilidad.declaraciones'::regclass;       → t, t
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.declaraciones', 'DELETE');                          → false
-- SELECT has_column_privilege('prisma_contabilidad', 'contabilidad.declaraciones', 'modelo', 'UPDATE');               → false
