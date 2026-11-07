-- CONTABILIDAD F5 — cierre del ejercicio, inmovilizado y amortizaciones, periodificaciones.
-- Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md F5. Requiere 0001 (0003/0004 no son necesarias).
--
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` (preview → producción tras OK de Alberto). ADITIVA: solo CREA tablas/funciones/índices,
--    añade dos cuentas al plan de las empresas existentes, un CHECK en `ejercicios` y un GRANT de columna. NO es idempotente en las tablas (CREATE TABLE sin IF NOT
--    EXISTS): se aplica UNA vez. Mientras no esté aplicada, /cierre, /inmovilizado y /cuentas-anuales lo dicen en vez de romper.
--
-- Diseño:
--   · `activos_fijos`: ficha del bien. La identidad y los importes son INMUTABLES; solo se puede dar de BAJA (una vez, definitiva).
--     (empresa, origen, ref_externa) único: una vertical que dé de alta el mismo bien dos veces no lo duplica.
--   · `amortizacion_tabla`: coeficientes por categoría, EDITABLES por versiones (solo se añaden; la vigente es la versión más alta).
--   · `periodificaciones`: solo se añaden. El asiento 480/485 y su reversa se guardan como asientos normales.
--   · `cierres_ejercicio`: UNA fila por ejercicio cerrado con sus asientos de regularización, cierre y apertura. Inmutable.
--   · `ejercicios.estado`: abierto → (en_cierre) → cerrado; CERRADO ES DEFINITIVO. Para cerrar hace falta la fila de `cierres_ejercicio` y que
--     TODAS las cuentas 6/7 estén a cero; la apertura debe ser el cierre con debe/haber intercambiados (apertura ≡ cierre).
--   · Un asiento de amortización/periodificación/cierre/apertura no se puede asentar dos veces para el mismo periodo salvo que el anterior esté
--     rectificado (trigger con bloqueo; 23505). Un ejercicio cerrado tampoco admite apuntes; `anio` = año de `inicio` y no hay ejercicios solapados.
--   · RLS ENABLE + FORCE por empresa (`empresa_actual()`), permisos mínimos para `prisma_contabilidad`, SIN DELETE ni TRUNCATE. Importes en
--     céntimos (bigint), sin float.

BEGIN;

-- ─── 1. Cuentas nuevas del plan (resultado de la baja de inmovilizado) para las empresas YA dadas de alta ───────────────
INSERT INTO contabilidad.plan_cuentas (empresa_id, codigo, nombre, grupo, naturaleza)
SELECT e.id, v.codigo, v.nombre, v.grupo, v.naturaleza
  FROM contabilidad.empresas e
 CROSS JOIN (VALUES
   ('671', 'Pérdidas procedentes del inmovilizado material', 6::smallint, 'deudora'),
   ('771', 'Beneficios procedentes del inmovilizado material', 7::smallint, 'acreedora')
 ) AS v(codigo, nombre, grupo, naturaleza)
ON CONFLICT (empresa_id, codigo) DO NOTHING;

-- ─── 2. Fichas de inmovilizado ───────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.activos_fijos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          uuid NOT NULL REFERENCES contabilidad.empresas(id),
  ref                 text NOT NULL CHECK (ref ~ '^[A-Za-z0-9._:/-]{1,64}$'),
  -- Quién da el alta: 'manual' o la vertical (p. ej. 'rrhh'). (origen, ref_externa) identifica el bien en su origen.
  origen              text NOT NULL CHECK (origen ~ '^[A-Za-z0-9._:/-]{1,64}$'),
  ref_externa         text NOT NULL CHECK (ref_externa ~ '^[A-Za-z0-9._:/-]{1,64}$'),
  descripcion         text NOT NULL CHECK (btrim(descripcion) <> '' AND length(descripcion) <= 200),
  categoria           text NOT NULL CHECK (btrim(categoria) <> ''),
  cuenta_activo       text NOT NULL CHECK (cuenta_activo ~ '^[1-9][0-9]{2,11}$'),
  cuenta_amort_acum   text NOT NULL CHECK (cuenta_amort_acum ~ '^[1-9][0-9]{2,11}$'),
  cuenta_gasto        text NOT NULL CHECK (cuenta_gasto ~ '^[1-9][0-9]{2,11}$'),
  fecha_alta          date NOT NULL,
  valor_cent          bigint NOT NULL CHECK (valor_cent > 0),
  residual_cent       bigint NOT NULL DEFAULT 0 CHECK (residual_cent >= 0),
  -- Coeficiente lineal anual en PUNTOS BÁSICOS (1.200 = 12 %).
  porcentaje_pb       integer NOT NULL CHECK (porcentaje_pb BETWEEN 1 AND 10000),
  metodo              text NOT NULL DEFAULT 'lineal' CHECK (metodo = 'lineal'),
  -- false = el alta no pasó por una factura asentada y se asentó con `asiento_alta_id`.
  ya_contabilizado    boolean NOT NULL DEFAULT true,
  asiento_alta_id     uuid,
  estado              text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'baja')),
  fecha_baja          date,
  precio_venta_cent   bigint CHECK (precio_venta_cent IS NULL OR precio_venta_cent >= 0),
  -- + beneficio (771) · − pérdida (671).
  resultado_baja_cent bigint,
  asiento_baja_id     uuid,
  creado_por          uuid,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  UNIQUE (empresa_id, ref),
  UNIQUE (empresa_id, origen, ref_externa),
  CHECK (residual_cent < valor_cent),
  CHECK ((estado = 'baja') = (fecha_baja IS NOT NULL)),
  CHECK (fecha_baja IS NULL OR fecha_baja >= fecha_alta),
  CHECK ((estado = 'baja') = (asiento_baja_id IS NOT NULL)),
  FOREIGN KEY (empresa_id, asiento_alta_id) REFERENCES contabilidad.asientos (empresa_id, id),
  FOREIGN KEY (empresa_id, asiento_baja_id) REFERENCES contabilidad.asientos (empresa_id, id)
);
CREATE INDEX idx_activos_fijos_estado ON contabilidad.activos_fijos (empresa_id, estado, fecha_alta);

-- Identidad e importes inmutables; solo se da de baja UNA vez (definitiva); nada se borra.
CREATE OR REPLACE FUNCTION contabilidad.activos_fijos_ciclo() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contabilidad.activos_fijos no se borra: un bien se da de baja';
  END IF;
  IF NEW.id <> OLD.id OR NEW.empresa_id <> OLD.empresa_id OR NEW.ref <> OLD.ref OR NEW.origen <> OLD.origen
     OR NEW.ref_externa <> OLD.ref_externa OR NEW.descripcion <> OLD.descripcion OR NEW.categoria <> OLD.categoria
     OR NEW.cuenta_activo <> OLD.cuenta_activo OR NEW.cuenta_amort_acum <> OLD.cuenta_amort_acum OR NEW.cuenta_gasto <> OLD.cuenta_gasto
     OR NEW.fecha_alta <> OLD.fecha_alta OR NEW.valor_cent <> OLD.valor_cent OR NEW.residual_cent <> OLD.residual_cent
     OR NEW.porcentaje_pb <> OLD.porcentaje_pb OR NEW.metodo <> OLD.metodo OR NEW.ya_contabilizado <> OLD.ya_contabilizado
     OR NEW.asiento_alta_id IS DISTINCT FROM OLD.asiento_alta_id OR NEW.creado_en <> OLD.creado_en THEN
    RAISE EXCEPTION 'la ficha del activo % es inmutable (solo se puede dar de baja)', OLD.ref;
  END IF;
  IF OLD.estado = 'baja' THEN
    RAISE EXCEPTION 'el activo % ya está dado de baja: es definitivo (corrige con un contraasiento)', OLD.ref;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_activos_fijos_ciclo
  BEFORE UPDATE OR DELETE ON contabilidad.activos_fijos
  FOR EACH ROW EXECUTE FUNCTION contabilidad.activos_fijos_ciclo();
CREATE TRIGGER trg_activos_fijos_sin_truncate
  BEFORE TRUNCATE ON contabilidad.activos_fijos
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();
CREATE TRIGGER trg_activos_fijos_actualizado_en
  BEFORE UPDATE ON contabilidad.activos_fijos
  FOR EACH ROW EXECUTE FUNCTION contabilidad.tocar_actualizado_en();

-- ─── 3. Tabla de amortización EDITABLE (versionada: solo se añaden versiones) ───────────────────────────────────────────
CREATE TABLE contabilidad.amortizacion_tabla (
  empresa_id           uuid NOT NULL REFERENCES contabilidad.empresas(id),
  version              integer NOT NULL CHECK (version >= 1),
  categoria            text NOT NULL CHECK (btrim(categoria) <> ''),
  descripcion          text NOT NULL CHECK (btrim(descripcion) <> ''),
  cuenta_activo        text NOT NULL CHECK (cuenta_activo ~ '^[1-9][0-9]{2,11}$'),
  cuenta_amort_acum    text NOT NULL CHECK (cuenta_amort_acum ~ '^[1-9][0-9]{2,11}$'),
  cuenta_gasto         text NOT NULL CHECK (cuenta_gasto ~ '^[1-9][0-9]{2,11}$'),
  porcentaje_max_pb    integer NOT NULL CHECK (porcentaje_max_pb BETWEEN 1 AND 10000),
  periodo_max_anios    integer NOT NULL CHECK (periodo_max_anios BETWEEN 1 AND 200),
  creado_por           uuid,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, version, categoria)
);
CREATE TRIGGER trg_amortizacion_tabla_inmutable
  BEFORE UPDATE OR DELETE ON contabilidad.amortizacion_tabla
  FOR EACH ROW EXECUTE FUNCTION contabilidad.prohibir_cambios();
CREATE TRIGGER trg_amortizacion_tabla_sin_truncate
  BEFORE TRUNCATE ON contabilidad.amortizacion_tabla
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();

-- ─── 4. Periodificaciones (solo se añaden) ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.periodificaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES contabilidad.empresas(id),
  ref            text NOT NULL CHECK (ref ~ '^[A-Za-z0-9._:/-]{1,64}$'),
  tipo           text NOT NULL CHECK (tipo IN ('gasto', 'ingreso')),
  descripcion    text NOT NULL CHECK (btrim(descripcion) <> '' AND length(descripcion) <= 200),
  cuenta_origen  text NOT NULL CHECK (cuenta_origen ~ '^[1-9][0-9]{2,11}$'),
  importe_cent   bigint NOT NULL CHECK (importe_cent > 0),
  inicio         date NOT NULL,
  fin            date NOT NULL,
  creado_por     uuid,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  UNIQUE (empresa_id, ref),
  CHECK (fin >= inicio),
  CHECK ((tipo = 'gasto' AND cuenta_origen LIKE '6%') OR (tipo = 'ingreso' AND cuenta_origen LIKE '7%'))
);
CREATE TRIGGER trg_periodificaciones_inmutable
  BEFORE UPDATE OR DELETE ON contabilidad.periodificaciones
  FOR EACH ROW EXECUTE FUNCTION contabilidad.prohibir_cambios();
CREATE TRIGGER trg_periodificaciones_sin_truncate
  BEFORE TRUNCATE ON contabilidad.periodificaciones
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();

-- ─── 5. Cierres de ejercicio (inmutables) ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.cierres_ejercicio (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                 uuid NOT NULL REFERENCES contabilidad.empresas(id),
  anio                       integer NOT NULL,
  -- + beneficio · − pérdida (el que fue a la cuenta 129).
  resultado_cent             bigint NOT NULL,
  -- La regularización puede faltar (ejercicio sin cuentas 6/7); el cierre y la apertura son siempre obligatorios.
  asiento_regularizacion_id  uuid,
  asiento_cierre_id          uuid NOT NULL,
  asiento_apertura_id        uuid NOT NULL,
  cerrado_por                uuid,
  cerrado_en                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, anio),
  FOREIGN KEY (empresa_id, anio) REFERENCES contabilidad.ejercicios (empresa_id, anio),
  FOREIGN KEY (empresa_id, asiento_regularizacion_id) REFERENCES contabilidad.asientos (empresa_id, id),
  FOREIGN KEY (empresa_id, asiento_cierre_id) REFERENCES contabilidad.asientos (empresa_id, id),
  FOREIGN KEY (empresa_id, asiento_apertura_id) REFERENCES contabilidad.asientos (empresa_id, id)
);
CREATE TRIGGER trg_cierres_ejercicio_inmutable
  BEFORE UPDATE OR DELETE ON contabilidad.cierres_ejercicio
  FOR EACH ROW EXECUTE FUNCTION contabilidad.prohibir_cambios();
CREATE TRIGGER trg_cierres_ejercicio_sin_truncate
  BEFORE TRUNCATE ON contabilidad.cierres_ejercicio
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();

-- Apertura ≡ cierre: por cuenta, Σ(haber − debe) del asiento de cierre + Σ(haber − debe) de la apertura = 0 (la apertura es el cierre invertido).
CREATE OR REPLACE FUNCTION contabilidad.cierre_apertura_igual() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  -- Los asientos pertenecen al año que toca: regularización y cierre al ejercicio `anio`; apertura al siguiente (y con su tipo de origen).
  IF NEW.asiento_regularizacion_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM contabilidad.asientos a WHERE a.empresa_id = NEW.empresa_id AND a.id = NEW.asiento_regularizacion_id
          AND a.ejercicio = NEW.anio AND a.origen = 'cierre') THEN
    RAISE EXCEPTION 'la regularización del ejercicio % debe ser un asiento de cierre de ese mismo ejercicio', NEW.anio;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contabilidad.asientos a WHERE a.empresa_id = NEW.empresa_id AND a.id = NEW.asiento_cierre_id
                    AND a.ejercicio = NEW.anio AND a.origen = 'cierre') THEN
    RAISE EXCEPTION 'el asiento de cierre del ejercicio % debe ser un asiento de cierre de ese mismo ejercicio', NEW.anio;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM contabilidad.asientos a WHERE a.empresa_id = NEW.empresa_id AND a.id = NEW.asiento_apertura_id
                    AND a.ejercicio = NEW.anio + 1 AND a.origen = 'apertura') THEN
    RAISE EXCEPTION 'el asiento de apertura del ejercicio % debe ser una apertura del ejercicio siguiente (%)', NEW.anio, NEW.anio + 1;
  END IF;
  IF EXISTS (
       SELECT 1 FROM contabilidad.apuntes p
        WHERE p.empresa_id = NEW.empresa_id AND p.asiento_id IN (NEW.asiento_cierre_id, NEW.asiento_apertura_id)
        GROUP BY p.cuenta HAVING sum(p.haber - p.debe) <> 0) THEN
    RAISE EXCEPTION 'la apertura del ejercicio % no coincide con su cierre (apertura ≡ cierre)', NEW.anio + 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_cierres_ejercicio_apertura_igual
  BEFORE INSERT ON contabilidad.cierres_ejercicio
  FOR EACH ROW EXECUTE FUNCTION contabilidad.cierre_apertura_igual();

-- ─── 6. Estado del ejercicio: CERRADO es definitivo, y para cerrar hay que haber regularizado y cerrado de verdad ───────
CREATE OR REPLACE FUNCTION contabilidad.ejercicio_estado_valido() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;
  IF OLD.estado = 'cerrado' THEN
    RAISE EXCEPTION 'el ejercicio % está cerrado: es definitivo (se corrige con un contraasiento en un ejercicio abierto)', OLD.anio;
  END IF;
  IF NEW.estado = 'cerrado' THEN
    IF NOT EXISTS (SELECT 1 FROM contabilidad.cierres_ejercicio c WHERE c.empresa_id = NEW.empresa_id AND c.anio = NEW.anio) THEN
      RAISE EXCEPTION 'no se puede cerrar el ejercicio %: falta su registro de cierre', NEW.anio;
    END IF;
    IF EXISTS (SELECT 1 FROM contabilidad.apuntes p
                 JOIN contabilidad.asientos a ON a.empresa_id = p.empresa_id AND a.id = p.asiento_id
                WHERE a.empresa_id = NEW.empresa_id AND a.ejercicio = NEW.anio AND p.cuenta ~ '^[67]'
                GROUP BY p.cuenta HAVING sum(p.debe) <> sum(p.haber)) THEN
      RAISE EXCEPTION 'no se puede cerrar el ejercicio %: las cuentas 6/7 no están a cero (falta regularizar)', NEW.anio;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ejercicios_estado
  BEFORE UPDATE ON contabilidad.ejercicios
  FOR EACH ROW EXECUTE FUNCTION contabilidad.ejercicio_estado_valido();

-- Un asiento de amortización / periodificación / cierre / apertura se asienta UNA vez por periodo (idempotencia en la propia BD), salvo que el
-- anterior ya esté RECTIFICADO (tiene su contraasiento: `reversa_de`): entonces el periodo puede reasentarse. Un índice único parcial no puede mirar
-- otras filas, así que lo hace un trigger, serializado por (empresa, tipo, ref) con un bloqueo de asesoramiento. 23505 = duplicado (la app responde 409).
CREATE OR REPLACE FUNCTION contabilidad.asiento_origen_f5_unico() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.origen_tipo IN ('amortizacion', 'periodificacion', 'cierre', 'apertura') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.empresa_id::text || '|' || NEW.origen_tipo || '|' || coalesce(NEW.origen_ref, ''), 0));
    IF EXISTS (SELECT 1 FROM contabilidad.asientos a
                WHERE a.empresa_id = NEW.empresa_id AND a.origen_tipo = NEW.origen_tipo AND a.origen_ref IS NOT DISTINCT FROM NEW.origen_ref
                  AND NOT EXISTS (SELECT 1 FROM contabilidad.asientos r WHERE r.empresa_id = a.empresa_id AND r.reversa_de = a.id)) THEN
      RAISE EXCEPTION 'uq_asientos_origen_f5: ya existe un asiento % % sin rectificar', NEW.origen_tipo, NEW.origen_ref USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_asientos_origen_f5_unico
  BEFORE INSERT ON contabilidad.asientos
  FOR EACH ROW EXECUTE FUNCTION contabilidad.asiento_origen_f5_unico();

-- Un ejercicio CERRADO no admite apuntes (defensa en profundidad: el trigger de `asientos` mira el ejercicio, este mira el del asiento del apunte).
CREATE OR REPLACE FUNCTION contabilidad.apunte_en_ejercicio_abierto() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE v_estado text;
BEGIN
  SELECT e.estado INTO v_estado FROM contabilidad.asientos a
    JOIN contabilidad.ejercicios e ON e.empresa_id = a.empresa_id AND e.anio = a.ejercicio
   WHERE a.empresa_id = NEW.empresa_id AND a.id = NEW.asiento_id;
  IF v_estado IS DISTINCT FROM 'abierto' THEN
    RAISE EXCEPTION 'el ejercicio del asiento % está % (o no existe): no admite apuntes', NEW.asiento_id, coalesce(v_estado, 'inexistente');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_apuntes_ejercicio_abierto
  BEFORE INSERT OR UPDATE ON contabilidad.apuntes
  FOR EACH ROW EXECUTE FUNCTION contabilidad.apunte_en_ejercicio_abierto();

-- Ejercicios: `anio` es el año de `inicio`, y dos ejercicios de la misma empresa no se solapan (trigger: sin extensión btree_gist).
ALTER TABLE contabilidad.ejercicios ADD CONSTRAINT ejercicios_anio_es_el_de_inicio CHECK (anio = extract(year FROM inicio)::int);
CREATE OR REPLACE FUNCTION contabilidad.ejercicio_sin_solape() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ejercicios|' || NEW.empresa_id::text, 0));
  IF EXISTS (SELECT 1 FROM contabilidad.ejercicios x
              WHERE x.empresa_id = NEW.empresa_id AND x.id <> NEW.id AND x.inicio <= NEW.fin AND x.fin >= NEW.inicio) THEN
    RAISE EXCEPTION 'el ejercicio % se solapa con otro ejercicio de la misma empresa', NEW.anio;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ejercicios_sin_solape
  BEFORE INSERT OR UPDATE OF inicio, fin ON contabilidad.ejercicios
  FOR EACH ROW EXECUTE FUNCTION contabilidad.ejercicio_sin_solape();

-- ─── 7. RLS ENABLE + FORCE por empresa ──────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['activos_fijos', 'amortizacion_tabla', 'periodificaciones', 'cierres_ejercicio'] LOOP
    EXECUTE format('ALTER TABLE contabilidad.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE contabilidad.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I USING (empresa_id = contabilidad.empresa_actual()) WITH CHECK (empresa_id = contabilidad.empresa_actual())',
                   t || '_por_empresa', t);
  END LOOP;
END $$;

-- ─── 8. Permisos MÍNIMOS del rol (nunca DELETE ni TRUNCATE ni ALL) ──────────────────────────────────────────────────────
GRANT SELECT, INSERT ON contabilidad.activos_fijos TO prisma_contabilidad;
GRANT UPDATE (estado, fecha_baja, precio_venta_cent, resultado_baja_cent, asiento_baja_id, actualizado_en) ON contabilidad.activos_fijos TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.amortizacion_tabla TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.periodificaciones TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.cierres_ejercicio TO prisma_contabilidad;
GRANT UPDATE (estado) ON contabilidad.ejercicios TO prisma_contabilidad;
REVOKE DELETE, TRUNCATE ON contabilidad.activos_fijos, contabilidad.amortizacion_tabla, contabilidad.periodificaciones, contabilidad.cierres_ejercicio FROM prisma_contabilidad;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────────────────────────────────────────────
-- SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid IN ('contabilidad.activos_fijos'::regclass, 'contabilidad.amortizacion_tabla'::regclass,
--        'contabilidad.periodificaciones'::regclass, 'contabilidad.cierres_ejercicio'::regclass);                                  → todo t, t
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.cierres_ejercicio', 'DELETE');                                    → false
-- SELECT has_column_privilege('prisma_contabilidad', 'contabilidad.ejercicios', 'estado', 'UPDATE');                                → true
-- SELECT has_column_privilege('prisma_contabilidad', 'contabilidad.ejercicios', 'inicio', 'UPDATE');                                → false
-- SELECT count(*) FROM contabilidad.plan_cuentas WHERE codigo IN ('671', '771');                                                    → 2 por empresa
