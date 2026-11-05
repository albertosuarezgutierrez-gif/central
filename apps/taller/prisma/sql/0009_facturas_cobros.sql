-- Vertical TALLER — 0009: facturación VeriFactu (facturas, líneas, cobros, contador sin huecos y registros encadenados).
-- Requiere 0001-0008 aplicados. IDEMPOTENTE. ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (preview → prod tras OK de
-- Alberto). Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md (F1) + 2026-11-04-taller-global2.md (F2: factura y cobros).
--
--  1) Sustituye las tablas `facturas` y `cobros` de 0001 (esqueleto sin uso: ningún código las escribe). Solo se borran si están
--     VACÍAS, comprobado con `row_security = off` (si el rol que aplica no salta RLS, el recuento FALLA en vez de ver 0 filas).
--  2) `contadores_factura` (taller, serie, año): la app lo lee y sube DENTRO de la transacción de emisión, bajo el candado
--     `pg_advisory_xact_lock(hashtext('factura:<taller>'))`, que no se suelta hasta el COMMIT (después de los INSERT). Rollback = el
--     número no se consume: sin huecos. Además, el trigger de `facturas` exige número = último + 1 y fecha que no retrocede.
--  3) `facturas` + `factura_lineas`: copia CONGELADA (cliente con NIF, líneas, desglose de IVA, totales, huella, QR, XML).
--     Tras emitir, solo cambian `estado` (emitida → anulada, una vez) y `estado_envio`. DELETE prohibido (trigger + sin GRANT).
--  4) `registros_verifactu`: cadena ÚNICA por taller (obligado tributario), alta y anulación, solo-añadir. El trigger toma el MISMO
--     candado y exige secuencia = anterior + 1 y huella_anterior = huella del anterior (el primero, sin anterior).
--  5) `cobros`: solo-añadir; el trigger bloquea la factura (FOR UPDATE) y rechaza superar el total o el efectivo ≥ 1.000 €
--     (espejo de LIMITE_EFECTIVO_CENT de module-taller, cepo test/esquema-sql.test.ts).
--  6) RLS forzado con la política por taller de siempre; GRANT mínimos a prisma_taller (INSERT/SELECT; UPDATE solo de columnas de
--     estado; nada de DELETE ni TRUNCATE).
--  ⚠️ 0002 hace `GRANT … UPDATE, DELETE ON ALL TABLES`: si se re-ejecutara DESPUÉS de esta, volvería a dar DELETE; los triggers de
--     inmutabilidad siguen impidiéndolo. Tras re-ejecutar 0002, vuelve a ejecutar esta (es idempotente y re-revoca).

BEGIN;

-- ─── 1. Retirar el esqueleto de 0001 (solo si está vacío) ─────────────────────
SET LOCAL row_security = off;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'taller' AND table_name = 'facturas' AND column_name = 'verifactu_huella') THEN
    IF EXISTS (SELECT 1 FROM taller.cobros) OR EXISTS (SELECT 1 FROM taller.facturas) THEN
      RAISE EXCEPTION '0009: taller.facturas/cobros (esquema de 0001) tienen filas: no se sustituyen a ciegas';
    END IF;
    DROP TABLE taller.cobros;
    DROP TABLE taller.facturas;
  END IF;
END $$;
SET LOCAL row_security = on;

-- ─── 2. Contador por (taller, serie, año) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.contadores_factura (
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  serie_id       uuid NOT NULL,
  anio           integer NOT NULL CHECK (anio BETWEEN 2000 AND 2999),
  ultimo_numero  integer NOT NULL CHECK (ultimo_numero >= 0),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (taller_id, serie_id, anio),
  FOREIGN KEY (taller_id, serie_id) REFERENCES taller.series_factura(taller_id, id)
);

-- ─── 3. Facturas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.facturas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id            uuid NOT NULL,
  ot_id                uuid NOT NULL,
  serie_id             uuid NOT NULL,
  serie_codigo         text NOT NULL,
  anio                 integer NOT NULL,
  numero               integer NOT NULL CHECK (numero > 0),
  num_serie            text NOT NULL CHECK (length(num_serie) BETWEEN 1 AND 60),   -- tal como se imprime (NumSerieFactura)
  fecha_expedicion     date NOT NULL,
  emitida_en           timestamptz NOT NULL,
  emitida_por          uuid,
  -- Espejo de TIPOS_FACTURA_TALLER de module-taller (cepo test/esquema-sql.test.ts).
  tipo                 text NOT NULL CHECK (tipo IN ('F1','F2','R1','R2','R3','R4','R5')),
  tipo_rectificativa   text CHECK (tipo_rectificativa IN ('S','I')),
  rectificada_id       uuid,
  motivo_rectificacion text,
  base_rectificada_cent  bigint,
  cuota_rectificada_cent bigint,
  -- Emisor y cliente: FOTO en el momento de emitir (cambiar la ficha después no cambia la factura).
  emisor_razon_social  text NOT NULL,
  emisor_nif           text NOT NULL CHECK (length(emisor_nif) BETWEEN 1 AND 9),
  emisor_domicilio     text,
  cliente_id           uuid,
  cliente_nombre       text,
  cliente_nif          text CHECK (cliente_nif IS NULL OR length(cliente_nif) BETWEEN 1 AND 9),
  cliente_domicilio    text,
  descripcion          text NOT NULL CHECK (length(descripcion) BETWEEN 1 AND 500),
  desglose_iva         jsonb NOT NULL,                                               -- [{ivaPuntosBasicos, baseCent, cuotaCent}]
  base_cent            bigint NOT NULL,
  cuota_iva_cent       bigint NOT NULL,
  total_cent           bigint NOT NULL,
  -- VeriFactu (registro de alta de ESTA factura; la cadena completa está en registros_verifactu).
  huella               text NOT NULL CHECK (huella ~ '^[0-9A-F]{64}$'),
  huella_anterior      text CHECK (huella_anterior IS NULL OR huella_anterior ~ '^[0-9A-F]{64}$'),
  fecha_hora_huso      text NOT NULL,
  qr_url               text NOT NULL,
  xml                  text NOT NULL,
  -- Espejo de ESTADOS_FACTURA / ESTADOS_ENVIO_AEAT de module-taller.
  estado               text NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','anulada')),
  anulada_en           timestamptz,
  motivo_anulacion     text,
  estado_envio         text NOT NULL DEFAULT 'no_enviado' CHECK (estado_envio IN ('no_enviado','enviado','rechazado','incierto')),
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, serie_id, anio, numero),
  UNIQUE (taller_id, num_serie),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, serie_id) REFERENCES taller.series_factura(taller_id, id),
  FOREIGN KEY (taller_id, rectificada_id) REFERENCES taller.facturas(taller_id, id),
  CHECK (total_cent = base_cent + cuota_iva_cent),
  CHECK (anio = extract(year FROM fecha_expedicion)::int),
  -- Completa y R1-R4: destinatario identificado; F2 y R5: sin destinatario.
  CHECK ((tipo IN ('F1','R1','R2','R3','R4')) = (cliente_nif IS NOT NULL)),
  -- Rectificativa ⇔ factura rectificada + tipo S/I; S lleva lo rectificado, I no.
  CHECK ((tipo LIKE 'R%') = (rectificada_id IS NOT NULL AND tipo_rectificativa IS NOT NULL)),
  CHECK ((tipo_rectificativa = 'S') = (base_rectificada_cent IS NOT NULL AND cuota_rectificada_cent IS NOT NULL)),
  -- Una ordinaria no es negativa (las negativas son rectificativas por diferencias).
  CHECK (tipo LIKE 'R%' OR total_cent > 0),
  CHECK ((estado = 'anulada') = (anulada_en IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON taller.facturas (taller_id, fecha_expedicion DESC);
-- Una OT tiene como mucho UNA factura ordinaria viva (dos pulsaciones de «Facturar» no dan dos facturas).
CREATE UNIQUE INDEX IF NOT EXISTS ux_facturas_ot_viva ON taller.facturas (taller_id, ot_id) WHERE estado = 'emitida' AND tipo IN ('F1','F2');

CREATE TABLE IF NOT EXISTS taller.factura_lineas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id          uuid NOT NULL,
  factura_id         uuid NOT NULL,
  orden              integer NOT NULL CHECK (orden > 0),
  ot_linea_id        uuid,
  tipo               text NOT NULL,
  descripcion        text NOT NULL CHECK (length(btrim(descripcion)) > 0),
  cantidad           integer NOT NULL CHECK (cantidad > 0),
  unidad             text NOT NULL CHECK (unidad IN ('min','ml','ud')),
  base_cent          bigint NOT NULL,                       -- negativa solo en rectificativas por diferencias
  iva_codigo         text NOT NULL,
  iva_puntos_basicos integer NOT NULL CHECK (iva_puntos_basicos BETWEEN 0 AND 9999),
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, factura_id, orden),
  FOREIGN KEY (taller_id, factura_id) REFERENCES taller.facturas(taller_id, id),
  FOREIGN KEY (taller_id, ot_linea_id) REFERENCES taller.ot_lineas(taller_id, id)
);

-- ─── 4. Registros VeriFactu (cadena por taller, solo-añadir) ─────────────────
CREATE TABLE IF NOT EXISTS taller.registros_verifactu (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id        uuid NOT NULL,
  factura_id       uuid NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN ('alta','anulacion')),
  secuencia        integer NOT NULL CHECK (secuencia > 0),
  id_emisor        text NOT NULL,
  num_serie        text NOT NULL,
  fecha_expedicion date NOT NULL,
  huella           text NOT NULL CHECK (huella ~ '^[0-9A-F]{64}$'),
  huella_anterior  text CHECK (huella_anterior IS NULL OR huella_anterior ~ '^[0-9A-F]{64}$'),
  fecha_hora_huso  text NOT NULL,
  xml              text NOT NULL,
  estado_envio     text NOT NULL DEFAULT 'no_enviado' CHECK (estado_envio IN ('no_enviado','enviado','rechazado','incierto')),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, secuencia),
  UNIQUE (taller_id, huella),
  UNIQUE (taller_id, factura_id, tipo),
  FOREIGN KEY (taller_id, factura_id) REFERENCES taller.facturas(taller_id, id),
  CHECK ((secuencia = 1) = (huella_anterior IS NULL))
);

-- ─── 5. Cobros (solo-añadir) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.cobros (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id         uuid NOT NULL,
  factura_id        uuid NOT NULL,
  medio_cobro_id    uuid NOT NULL,
  medio_codigo      text NOT NULL,                          -- foto del medio al cobrar
  es_efectivo       boolean NOT NULL,
  importe_cent      bigint NOT NULL CHECK (importe_cent > 0),
  cobrado_en        timestamptz NOT NULL,
  registrado_por    uuid,
  justificante      text,                                   -- número del justificante (core-receipts)
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, factura_id) REFERENCES taller.facturas(taller_id, id),
  FOREIGN KEY (taller_id, medio_cobro_id) REFERENCES taller.medios_cobro(taller_id, id)
);
CREATE INDEX IF NOT EXISTS idx_cobros_factura ON taller.cobros (taller_id, factura_id);

-- ─── 6. Triggers ─────────────────────────────────────────────────────────────
-- Emisión: el MISMO candado que la app (re-entrante en la transacción); número = último + 1 en (taller, serie, año) y la fecha
-- de expedición no retrocede respecto a la última de la serie.
CREATE OR REPLACE FUNCTION taller.facturas_correlativa() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_ultimo integer;
  v_fecha  date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('factura:' || NEW.taller_id::text));
  SELECT max(numero), max(fecha_expedicion) INTO v_ultimo, v_fecha
    FROM taller.facturas WHERE taller_id = NEW.taller_id AND serie_id = NEW.serie_id AND anio = NEW.anio;
  IF NEW.numero <> coalesce(v_ultimo, 0) + 1 THEN
    RAISE EXCEPTION 'factura % no es correlativa (último %, llega %)', NEW.num_serie, coalesce(v_ultimo, 0), NEW.numero;
  END IF;
  IF v_fecha IS NOT NULL AND NEW.fecha_expedicion < v_fecha THEN
    RAISE EXCEPTION 'factura %: la fecha % retrocede respecto a la última de la serie (%)', NEW.num_serie, NEW.fecha_expedicion, v_fecha;
  END IF;
  IF NEW.estado <> 'emitida' OR NEW.estado_envio <> 'no_enviado' THEN
    RAISE EXCEPTION 'una factura nace emitida y sin enviar';
  END IF;
  RETURN NEW;
END $$;

-- Inmutable tras emitir: solo estado (emitida → anulada, una vez) y estado_envio. Nada se borra.
CREATE OR REPLACE FUNCTION taller.facturas_inmutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  libres text[] := ARRAY['estado','anulada_en','motivo_anulacion','estado_envio','actualizado_en'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'una factura emitida no se borra (anúlala o rectifícala)';
  END IF;
  IF (to_jsonb(NEW) - libres) IS DISTINCT FROM (to_jsonb(OLD) - libres) THEN
    RAISE EXCEPTION 'factura %: emitida e inmutable (solo cambian estado y estado_envio)', OLD.num_serie;
  END IF;
  IF OLD.estado = 'anulada' AND (NEW.estado, NEW.anulada_en, NEW.motivo_anulacion) IS DISTINCT FROM (OLD.estado, OLD.anulada_en, OLD.motivo_anulacion) THEN
    RAISE EXCEPTION 'factura % ya anulada: no se modifica', OLD.num_serie;
  END IF;
  IF OLD.estado = 'emitida' AND NEW.estado = 'emitida' AND (NEW.anulada_en, NEW.motivo_anulacion) IS DISTINCT FROM (OLD.anulada_en, OLD.motivo_anulacion) THEN
    RAISE EXCEPTION 'factura %: la anulación se marca con estado = anulada', OLD.num_serie;
  END IF;
  IF NEW.estado = 'anulada' AND OLD.estado = 'emitida' AND NOT EXISTS (
      SELECT 1 FROM taller.registros_verifactu r
       WHERE r.taller_id = OLD.taller_id AND r.factura_id = OLD.id AND r.tipo = 'anulacion') THEN
    RAISE EXCEPTION 'factura %: no se anula sin su registro de anulación VeriFactu', OLD.num_serie;
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

-- Cadena VeriFactu: secuencia y huella encadenadas, bajo el mismo candado que la emisión.
CREATE OR REPLACE FUNCTION taller.registros_verifactu_encadenado() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_sec    integer;
  v_huella text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('factura:' || NEW.taller_id::text));
  SELECT secuencia, huella INTO v_sec, v_huella
    FROM taller.registros_verifactu WHERE taller_id = NEW.taller_id ORDER BY secuencia DESC LIMIT 1;
  IF v_sec IS NULL THEN
    IF NEW.secuencia <> 1 OR NEW.huella_anterior IS NOT NULL THEN
      RAISE EXCEPTION 'el primer registro VeriFactu del taller va sin anterior y con secuencia 1';
    END IF;
  ELSIF NEW.secuencia <> v_sec + 1 OR NEW.huella_anterior IS DISTINCT FROM v_huella THEN
    RAISE EXCEPTION 'cadena VeriFactu rota: esperaba secuencia % y huella anterior %', v_sec + 1, v_huella;
  END IF;
  IF NEW.estado_envio <> 'no_enviado' THEN
    RAISE EXCEPTION 'un registro nace sin enviar';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION taller.registros_verifactu_inmutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  libres text[] := ARRAY['estado_envio','actualizado_en'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'registros_verifactu es solo-añadir';
  END IF;
  IF (to_jsonb(NEW) - libres) IS DISTINCT FROM (to_jsonb(OLD) - libres) THEN
    RAISE EXCEPTION 'registro VeriFactu inmutable (solo cambia estado_envio)';
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

-- Cobros: factura emitida, sin pasar del total y efectivo por debajo del límite legal (espejo de LIMITE_EFECTIVO_CENT).
CREATE OR REPLACE FUNCTION taller.cobros_validos() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_total    bigint;
  v_estado   text;
  v_cobrado  bigint;
  v_efectivo bigint;
BEGIN
  SELECT total_cent, estado INTO v_total, v_estado
    FROM taller.facturas WHERE taller_id = NEW.taller_id AND id = NEW.factura_id FOR UPDATE;
  IF v_estado IS DISTINCT FROM 'emitida' OR v_total <= 0 THEN
    RAISE EXCEPTION 'solo se cobra una factura emitida con importe a cobrar';
  END IF;
  SELECT coalesce(sum(importe_cent), 0), coalesce(sum(importe_cent) FILTER (WHERE es_efectivo), 0)
    INTO v_cobrado, v_efectivo
    FROM taller.cobros WHERE taller_id = NEW.taller_id AND factura_id = NEW.factura_id;
  IF v_cobrado + NEW.importe_cent > v_total THEN
    RAISE EXCEPTION 'los cobros superarían el total de la factura';
  END IF;
  IF NEW.es_efectivo AND v_efectivo + NEW.importe_cent >= 100000 THEN
    RAISE EXCEPTION 'efectivo igual o superior a 1.000 euros (Ley 7/2012)';
  END IF;
  IF NEW.es_efectivo IS DISTINCT FROM (SELECT m.es_efectivo FROM taller.medios_cobro m WHERE m.taller_id = NEW.taller_id AND m.id = NEW.medio_cobro_id) THEN
    RAISE EXCEPTION 'es_efectivo no coincide con el medio de cobro';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_facturas_correlativa ON taller.facturas;
CREATE TRIGGER trg_facturas_correlativa BEFORE INSERT ON taller.facturas
  FOR EACH ROW EXECUTE FUNCTION taller.facturas_correlativa();
DROP TRIGGER IF EXISTS trg_facturas_inmutable ON taller.facturas;
CREATE TRIGGER trg_facturas_inmutable BEFORE UPDATE OR DELETE ON taller.facturas
  FOR EACH ROW EXECUTE FUNCTION taller.facturas_inmutable();
DROP TRIGGER IF EXISTS trg_factura_lineas_solo_insertar ON taller.factura_lineas;
CREATE TRIGGER trg_factura_lineas_solo_insertar BEFORE UPDATE OR DELETE ON taller.factura_lineas
  FOR EACH ROW EXECUTE FUNCTION taller.solo_insertar();
DROP TRIGGER IF EXISTS trg_registros_verifactu_encadenado ON taller.registros_verifactu;
CREATE TRIGGER trg_registros_verifactu_encadenado BEFORE INSERT ON taller.registros_verifactu
  FOR EACH ROW EXECUTE FUNCTION taller.registros_verifactu_encadenado();
DROP TRIGGER IF EXISTS trg_registros_verifactu_inmutable ON taller.registros_verifactu;
CREATE TRIGGER trg_registros_verifactu_inmutable BEFORE UPDATE OR DELETE ON taller.registros_verifactu
  FOR EACH ROW EXECUTE FUNCTION taller.registros_verifactu_inmutable();
DROP TRIGGER IF EXISTS trg_cobros_validos ON taller.cobros;
CREATE TRIGGER trg_cobros_validos BEFORE INSERT ON taller.cobros
  FOR EACH ROW EXECUTE FUNCTION taller.cobros_validos();
DROP TRIGGER IF EXISTS trg_cobros_solo_insertar ON taller.cobros;
CREATE TRIGGER trg_cobros_solo_insertar BEFORE UPDATE OR DELETE ON taller.cobros
  FOR EACH ROW EXECUTE FUNCTION taller.solo_insertar();
DROP TRIGGER IF EXISTS trg_contadores_factura_actualizado_en ON taller.contadores_factura;
CREATE TRIGGER trg_contadores_factura_actualizado_en BEFORE UPDATE ON taller.contadores_factura
  FOR EACH ROW EXECUTE FUNCTION taller.tocar_actualizado_en();
-- Un contador solo SUBE de uno en uno (bajarlo reutilizaría números).
CREATE OR REPLACE FUNCTION taller.contadores_factura_solo_sube() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'un contador de facturas no se borra'; END IF;
  IF (NEW.taller_id, NEW.serie_id, NEW.anio) IS DISTINCT FROM (OLD.taller_id, OLD.serie_id, OLD.anio) OR NEW.ultimo_numero <> OLD.ultimo_numero + 1 THEN
    RAISE EXCEPTION 'el contador de facturas solo sube de uno en uno';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_contadores_factura_solo_sube ON taller.contadores_factura;
CREATE TRIGGER trg_contadores_factura_solo_sube BEFORE UPDATE OR DELETE ON taller.contadores_factura
  FOR EACH ROW EXECUTE FUNCTION taller.contadores_factura_solo_sube();

-- ─── 7. RLS forzado y política por taller (mismo patrón que 0001/0007) ────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contadores_factura','facturas','factura_lineas','registros_verifactu','cobros'] LOOP
    EXECUTE format('ALTER TABLE taller.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE taller.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'taller' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY %I ON taller.%I USING (taller_id = taller.taller_actual()) WITH CHECK (taller_id = taller.taller_actual())',
                     t || '_por_taller', t);
    END IF;
  END LOOP;
END $$;

-- ─── 8. Permisos mínimos del rol de la app ───────────────────────────────────
REVOKE ALL ON taller.contadores_factura, taller.facturas, taller.factura_lineas, taller.registros_verifactu, taller.cobros FROM prisma_taller;
GRANT SELECT, INSERT ON taller.contadores_factura, taller.facturas, taller.factura_lineas, taller.registros_verifactu, taller.cobros TO prisma_taller;
GRANT UPDATE (ultimo_numero, actualizado_en) ON taller.contadores_factura TO prisma_taller;
GRANT UPDATE (estado, anulada_en, motivo_anulacion, estado_envio, actualizado_en) ON taller.facturas TO prisma_taller;
GRANT UPDATE (estado_envio, actualizado_en) ON taller.registros_verifactu TO prisma_taller;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'taller' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);          → 0 filas
-- SELECT has_table_privilege('prisma_taller', 'taller.facturas', 'DELETE');                                     → false
-- SELECT has_column_privilege('prisma_taller', 'taller.facturas', 'total_cent', 'UPDATE');                      → false
-- SELECT has_column_privilege('prisma_taller', 'taller.facturas', 'estado_envio', 'UPDATE');                    → true
-- SELECT has_table_privilege('prisma_taller', 'taller.registros_verifactu', 'TRUNCATE');                        → false
