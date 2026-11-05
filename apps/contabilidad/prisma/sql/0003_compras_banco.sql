-- CONTABILIDAD F3 — actividad (CNAE), compras (facturas recibidas), banco (Norma 43 / CSV) y conciliación.
-- Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md §4.3 (CNAE) y F3. Requiere 0001 y 0002 aplicadas.
--
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` tras 0002 (preview → producción tras OK de Alberto). NO es idempotente en las tablas
--    (CREATE TABLE sin IF NOT EXISTS): se aplica UNA vez. Mientras no esté aplicada la app sigue funcionando: Compras, Banco y Ajustes →
--    Actividad lo dicen en pantalla en vez de romper (cada acceso va en su propia transacción y a prueba de fallos).
--
-- Diseño:
--   · `empresas.cnae`: CNAE-2009 a 4 dígitos, NULL = «no se sabe». Solo cambia por `fijar_actividad()` (SECURITY DEFINER): el rol de la
--     app sigue sin poder escribir en `empresas`. La función exige que la empresa pedida sea la de la transacción (RLS).
--   · `proveedores`: lo que se recuerda de un proveedor (categoría de gasto y retención habitual). Preferencias editables, no contabilidad.
--   · `facturas_recibidas`: INMUTABLE. Única por (empresa, NIF proveedor, nº normalizado) → el duplicado lo rechaza la BD aunque falle
--     la app. `mensaje_id` única por empresa = ingesta idempotente por Message-ID (cuando se conecte una fuente). Lo pendiente de pago NO
--     se guarda: sale de la partida 40x/41x del libro (un solo origen de verdad).
--   · `movimientos_banco`: INMUTABLE. Única por (empresa, huella): reimportar el mismo extracto no duplica.
--   · `conciliaciones`: INMUTABLE y ÚNICA por movimiento: un movimiento nunca se asigna a dos facturas/asientos.
--   · `reglas_conciliacion`: reglas por concepto; solo se puede DESACTIVAR (no se borra ni se reescribe).
--   · RLS ENABLE + FORCE por empresa en todas, permisos mínimos (nunca DELETE/TRUNCATE), sin float: importes en céntimos (bigint).

BEGIN;

-- ─── 1. Actividad de la empresa ─────────────────────────────────────────────────────────────────────────────────
ALTER TABLE contabilidad.empresas ADD COLUMN cnae text CHECK (cnae IS NULL OR cnae ~ '^[0-9]{4}$');

-- Cambia la actividad (CNAE) y/o la plantilla sectorial de LA empresa de la transacción. p_sector NULL = no tocar la plantilla.
CREATE OR REPLACE FUNCTION contabilidad.fijar_actividad(p_empresa uuid, p_cnae text, p_sector text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
BEGIN
  IF p_empresa IS NULL OR p_empresa IS DISTINCT FROM contabilidad.empresa_actual() THEN
    RAISE EXCEPTION 'fijar_actividad solo actúa sobre la empresa de la sesión';
  END IF;
  IF p_cnae IS NOT NULL AND p_cnae !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'CNAE no válido: 4 dígitos';
  END IF;
  IF p_sector IS NOT NULL AND p_sector NOT IN ('generico', 'taller', 'hosteleria', 'limpieza', 'alquiler') THEN
    RAISE EXCEPTION 'plantilla no válida';
  END IF;
  UPDATE contabilidad.empresas SET cnae = p_cnae, sector = COALESCE(p_sector, sector) WHERE id = p_empresa;
END $$;
REVOKE ALL ON FUNCTION contabilidad.fijar_actividad(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contabilidad.fijar_actividad(uuid, text, text) TO prisma_contabilidad;

-- ─── 2. Proveedores recordados ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.proveedores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  nif             text NOT NULL CHECK (nif ~ '^[A-Z0-9]{8,12}$'),
  nombre          text NOT NULL CHECK (btrim(nombre) <> '' AND length(nombre) <= 200),
  tipo            text NOT NULL DEFAULT 'proveedor' CHECK (tipo IN ('proveedor', 'acreedor')),
  categoria       text CHECK (categoria IS NULL OR categoria ~ '^[a-z][a-z0-9_]{1,40}$'),
  retencion_pct   smallint CHECK (retencion_pct IS NULL OR retencion_pct BETWEEN 0 AND 100),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nif)
);

-- ─── 3. Facturas recibidas (inmutables) ─────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.facturas_recibidas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  proveedor_nif   text NOT NULL CHECK (proveedor_nif ~ '^[A-Z0-9]{8,12}$'),
  proveedor_nombre text NOT NULL CHECK (btrim(proveedor_nombre) <> ''),
  numero          text NOT NULL CHECK (btrim(numero) <> '' AND length(numero) <= 60),
  numero_norm     text NOT NULL CHECK (btrim(numero_norm) <> '' AND length(numero_norm) <= 60),
  fecha           date NOT NULL,
  fecha_contable  date NOT NULL,
  base_cent       bigint NOT NULL CHECK (base_cent >= 0),
  cuota_cent      bigint NOT NULL CHECK (cuota_cent >= 0),
  retencion_cent  bigint NOT NULL DEFAULT 0 CHECK (retencion_cent >= 0 AND retencion_cent <= base_cent),
  total_cent      bigint NOT NULL CHECK (total_cent = base_cent + cuota_cent),
  lineas          jsonb NOT NULL,
  origen          text NOT NULL CHECK (origen IN ('manual', 'gmail', 'ocr', 'vertical')),
  mensaje_id      text CHECK (mensaje_id IS NULL OR (btrim(mensaje_id) <> '' AND length(mensaje_id) <= 300)),
  -- Solo REFERENCIA al documento: nada se sube a ningún almacenamiento desde esta fase.
  adjunto_ref     text CHECK (adjunto_ref IS NULL OR length(adjunto_ref) <= 300),
  hecho_id        uuid NOT NULL,
  asiento_id      uuid,
  creada_por      uuid,
  creada_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  -- DUPLICADO: mismo proveedor + mismo número (normalizado) = la misma factura.
  UNIQUE (empresa_id, proveedor_nif, numero_norm),
  FOREIGN KEY (empresa_id, hecho_id) REFERENCES contabilidad.hechos_contables (empresa_id, id),
  FOREIGN KEY (empresa_id, asiento_id) REFERENCES contabilidad.asientos (empresa_id, id)
);
CREATE UNIQUE INDEX uq_facturas_recibidas_mensaje ON contabilidad.facturas_recibidas (empresa_id, mensaje_id) WHERE mensaje_id IS NOT NULL;
CREATE INDEX idx_facturas_recibidas_fecha ON contabilidad.facturas_recibidas (empresa_id, fecha_contable DESC, creada_en DESC);

-- ─── 4. Banco: movimientos importados (inmutables) ──────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.movimientos_banco (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  cuenta_ref      text NOT NULL CHECK (btrim(cuenta_ref) <> '' AND length(cuenta_ref) <= 60),
  fecha           date NOT NULL,
  fecha_valor     date NOT NULL,
  importe_cent    bigint NOT NULL CHECK (importe_cent <> 0),
  concepto        text NOT NULL DEFAULT '',
  contraparte     text NOT NULL DEFAULT '',
  referencia      text NOT NULL DEFAULT '',
  saldo_cent      bigint,
  origen          text NOT NULL CHECK (origen IN ('norma43', 'csv', 'psd2')),
  -- SHA-256 del movimiento (con ordinal para repetidos del mismo fichero): reimportar el mismo extracto no duplica.
  huella          text NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
  importado_por   uuid,
  importado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  UNIQUE (empresa_id, huella)
);
CREATE INDEX idx_movimientos_banco_fecha ON contabilidad.movimientos_banco (empresa_id, fecha DESC, importado_en DESC);

-- ─── 5. Conciliación (inmutable, una por movimiento) ────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.conciliaciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  movimiento_id   uuid NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('cobro', 'pago', 'regla')),
  documento       text,
  cuenta          text CHECK (cuenta IS NULL OR cuenta ~ '^[1-9][0-9]{2,11}$'),
  metodo          text NOT NULL CHECK (metodo IN ('importe_exacto', 'regla', 'manual')),
  hecho_id        uuid NOT NULL,
  asiento_id      uuid,
  confirmada_por  uuid,
  confirmada_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  -- Un movimiento NUNCA se asigna a dos facturas/asientos.
  UNIQUE (empresa_id, movimiento_id),
  CHECK ((tipo = 'regla') = (documento IS NULL)),
  FOREIGN KEY (empresa_id, movimiento_id) REFERENCES contabilidad.movimientos_banco (empresa_id, id),
  FOREIGN KEY (empresa_id, hecho_id) REFERENCES contabilidad.hechos_contables (empresa_id, id),
  FOREIGN KEY (empresa_id, asiento_id) REFERENCES contabilidad.asientos (empresa_id, id)
);

CREATE TABLE contabilidad.reglas_conciliacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  patron          text NOT NULL CHECK (length(btrim(patron)) BETWEEN 3 AND 80),
  cuenta          text NOT NULL CHECK (cuenta ~ '^[1-9][0-9]{2,11}$'),
  sentido         text NOT NULL CHECK (sentido IN ('cargo', 'abono', 'ambos')),
  activa          boolean NOT NULL DEFAULT true,
  creada_por      uuid,
  creada_en       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_reglas_conciliacion ON contabilidad.reglas_conciliacion (empresa_id, lower(btrim(patron)), sentido);

-- ─── 6. Inmutabilidad (reutiliza prohibir_cambios de 0001) ──────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['facturas_recibidas', 'movimientos_banco', 'conciliaciones'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_inmutable BEFORE UPDATE OR DELETE ON contabilidad.%I
                    FOR EACH ROW EXECUTE FUNCTION contabilidad.prohibir_cambios()', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_sin_truncate BEFORE TRUNCATE ON contabilidad.%I
                    FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios()', t, t);
  END LOOP;
END $$;

-- Reglas de conciliación: solo cambia `activa` (de true a false); nada se borra.
CREATE OR REPLACE FUNCTION contabilidad.reglas_conciliacion_solo_desactivar() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contabilidad.reglas_conciliacion no se borra: se desactiva';
  END IF;
  IF NEW.id <> OLD.id OR NEW.empresa_id <> OLD.empresa_id OR NEW.patron <> OLD.patron OR NEW.cuenta <> OLD.cuenta
     OR NEW.sentido <> OLD.sentido OR NEW.creada_en <> OLD.creada_en OR (NEW.activa AND NOT OLD.activa) THEN
    RAISE EXCEPTION 'la regla de conciliación % solo puede desactivarse', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_reglas_conciliacion_solo_desactivar
  BEFORE UPDATE OR DELETE ON contabilidad.reglas_conciliacion
  FOR EACH ROW EXECUTE FUNCTION contabilidad.reglas_conciliacion_solo_desactivar();
CREATE TRIGGER trg_reglas_conciliacion_sin_truncate
  BEFORE TRUNCATE ON contabilidad.reglas_conciliacion
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();

CREATE TRIGGER trg_proveedores_actualizado_en BEFORE UPDATE ON contabilidad.proveedores
  FOR EACH ROW EXECUTE FUNCTION contabilidad.tocar_actualizado_en();

-- ─── 7. RLS ENABLE + FORCE por empresa (todas las tablas nuevas) ────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proveedores', 'facturas_recibidas', 'movimientos_banco', 'conciliaciones', 'reglas_conciliacion'] LOOP
    EXECUTE format('ALTER TABLE contabilidad.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE contabilidad.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I
                      USING (empresa_id = contabilidad.empresa_actual()) WITH CHECK (empresa_id = contabilidad.empresa_actual())',
                   t || '_por_empresa', t);
  END LOOP;
END $$;

-- ─── 8. Permisos MÍNIMOS ────────────────────────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT ON contabilidad.proveedores, contabilidad.facturas_recibidas, contabilidad.movimientos_banco,
                        contabilidad.conciliaciones, contabilidad.reglas_conciliacion TO prisma_contabilidad;
GRANT UPDATE (nombre, tipo, categoria, retencion_pct, actualizado_en) ON contabilidad.proveedores TO prisma_contabilidad;
GRANT UPDATE (activa) ON contabilidad.reglas_conciliacion TO prisma_contabilidad;
REVOKE DELETE, TRUNCATE ON contabilidad.proveedores, contabilidad.facturas_recibidas, contabilidad.movimientos_banco,
                           contabilidad.conciliaciones, contabilidad.reglas_conciliacion FROM prisma_contabilidad;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────────────────────────────────────────
-- SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid IN ('contabilidad.facturas_recibidas'::regclass,
--   'contabilidad.movimientos_banco'::regclass, 'contabilidad.conciliaciones'::regclass);                          → t, t en las tres
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.facturas_recibidas', 'UPDATE');                  → false
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.conciliaciones', 'DELETE');                      → false
-- SELECT has_column_privilege('prisma_contabilidad', 'contabilidad.empresas', 'cnae', 'UPDATE');                   → false
