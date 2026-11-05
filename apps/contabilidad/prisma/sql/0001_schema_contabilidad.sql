-- CONTABILIDAD multi-empresa (agnóstica de sector) — schema `contabilidad` + rol `prisma_contabilidad` (F1 del esqueleto).
-- Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md (§4.5 BD/roles, §5 modelo de datos, 7bis consentimiento).
--
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` (preview → producción tras OK de Alberto). No toca ninguna tabla existente.
--    NO es idempotente en las tablas (CREATE TABLE sin IF NOT EXISTS): se aplica UNA vez. El bloque del rol sí lo es.
--    La contraseña del rol la pone el operador en el MISMO paso que la DATABASE_URL del proyecto Vercel:
--      ALTER ROLE prisma_contabilidad WITH PASSWORD <la del gestor de secretos>   (nunca en este fichero ni en el repo)
--
-- Diseño:
--   · Multi-empresa: TODA tabla de negocio lleva `empresa_id` (en `empresas`, su `id`) y las FK entre tablas son COMPUESTAS
--     (empresa_id, x) → una fila nunca apunta a otra de otra empresa.
--   · RLS ACTIVADO y FORZADO en todas las tablas. La política compara con `contabilidad.empresa_actual()`, que lee
--     `current_setting('contabilidad.empresa_id', true)`; la app hace `set_config(..., true)` (LOCAL) al abrir CADA
--     transacción (lib/rls.ts). Sin ajuste → NULL → cero filas (falla CERRADO). Un gestor con N empresas abre una
--     transacción por empresa: nunca una consulta cruzada.
--   · Excepciones de la política por empresa, a propósito: `usuarios` (visible solo si está vinculado a la empresa actual)
--     y `acceso_otps` (solo hashes del código de acceso; no hay empresa todavía cuando se pide). Lo que hay que hacer SIN
--     empresa (alta, login, selector) va por funciones SECURITY DEFINER con `search_path` fijo y REVOKE de PUBLIC.
--   · Dinero en CÉNTIMOS (bigint). Nada de numeric/float para importes.
--   · INMUTABLE: `asientos`, `apuntes`, `auditoria`, `reglas_asiento` (versionadas) → trigger que impide UPDATE/DELETE/TRUNCATE
--     + REVOKE al rol. Corregir = contraasiento (`reversa_de`). `hechos_contables`: el contenido no cambia; solo su estado
--     avanza (pendiente_de_regla → asentado). `consentimiento_seguros`: solo-añadir; única modificación = la retirada (una vez).
--   · Cuadre en BD (defensa en profundidad del núcleo `validarAsiento`): trigger DIFERIDO al COMMIT que exige ≥ 2 apuntes y
--     Σ debe = Σ haber por asiento. Fecha dentro de un ejercicio ABIERTO y cuenta hoja/activa del plan: trigger BEFORE INSERT.
--   · Numeración correlativa por (empresa, ejercicio): `ejercicios.ultimo_numero` con SELECT … FOR UPDATE en la misma
--     transacción que el asiento (patrón sivra). Solo puede crecer.
--   · NULL = «no se sabe» (p. ej. `regimen_iva`), nunca «no hay».

BEGIN;

-- ─── 0. Rol de la app (LOGIN, NOBYPASSRLS, SIN contraseña: inerte hasta que el operador la ponga) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_contabilidad') THEN
    CREATE ROLE prisma_contabilidad WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
-- Si alguien lo hubiera creado a mano saltándose RLS, se le quita (el aislamiento por empresa depende de ello).
ALTER ROLE prisma_contabilidad WITH NOBYPASSRLS;
ALTER ROLE prisma_contabilidad SET search_path = contabilidad, public;

CREATE SCHEMA IF NOT EXISTS contabilidad;
REVOKE ALL ON SCHEMA contabilidad FROM PUBLIC;
-- Supabase: los roles de PostgREST no tocan este schema (no está expuesto, pero por si alguien lo expone).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA contabilidad FROM %I', r);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION contabilidad.empresa_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('contabilidad.empresa_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION contabilidad.tocar_actualizado_en() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION contabilidad.prohibir_cambios() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'contabilidad.% es inmutable (%): se corrige con un contraasiento o una versión nueva, nunca editando',
    TG_TABLE_NAME, TG_OP;
END $$;

-- ─── 1. Empresas, usuarios y acceso ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.empresas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nif             text NOT NULL UNIQUE CHECK (nif ~ '^[A-Z0-9]{8,12}$'),
  razon_social    text NOT NULL CHECK (btrim(razon_social) <> ''),
  forma           text NOT NULL CHECK (forma IN ('sociedad', 'autonomo')),
  -- Plantilla sectorial (DATO: plan sugerido + reglas por tipo de hecho). El núcleo no sabe de sectores.
  sector          text NOT NULL CHECK (sector IN ('generico', 'taller', 'hosteleria', 'limpieza', 'alquiler')),
  regimen_iva     text,             -- NULL = no se sabe todavía (nunca «general» por defecto)
  moneda          text NOT NULL DEFAULT 'EUR' CHECK (moneda = 'EUR'),
  -- Marca intermedia: logo y color de la EMPRESA mandan; «con Grupo ASegura» es una línea pequeña fija.
  logo_url        text,
  color_primario  text CHECK (color_primario IS NULL OR color_primario ~ '^#[0-9a-f]{6}$'),
  activo          boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- Usuarios (dueño y gestor) por CORREO. Un gestor ve N empresas por `usuario_empresas`. Sin contraseña: código de 6 dígitos.
CREATE TABLE contabilidad.usuarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre          text NOT NULL CHECK (btrim(nombre) <> ''),
  activo          boolean NOT NULL DEFAULT true,
  -- Versión de sesión: «Salir» o una baja la sube y toda cookie anterior deja de valer (se revalida en BD cada petición).
  sesion_version  integer NOT NULL DEFAULT 0 CHECK (sesion_version >= 0),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contabilidad.usuario_empresas (
  usuario_id      uuid NOT NULL REFERENCES contabilidad.usuarios(id),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  rol             text NOT NULL CHECK (rol IN ('dueno', 'gestor')),
  activo          boolean NOT NULL DEFAULT true,
  revocado_en     timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, empresa_id),
  CHECK (activo OR revocado_en IS NOT NULL)
);
CREATE INDEX idx_usuario_empresas_empresa ON contabilidad.usuario_empresas (empresa_id, rol) WHERE activo;

-- Códigos de acceso (OTP de 6 dígitos). Solo HASHES (HMAC con pimienta de entorno), nunca los dígitos.
CREATE TABLE contabilidad.acceso_otps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash      text NOT NULL CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  codigo_hash     text NOT NULL CHECK (codigo_hash ~ '^[0-9a-f]{64}$'),
  ip              text NOT NULL,
  -- 'no_enviado' = el canal de correo no está conectado: el código existe pero NO ha salido a nadie.
  envio           text NOT NULL CHECK (envio IN ('no_enviado', 'enviado', 'fallido')),
  intentos        integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  usado_en        timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_acceso_otps_email ON contabilidad.acceso_otps (email_hash, creado_en DESC);
CREATE INDEX idx_acceso_otps_ip ON contabilidad.acceso_otps (ip, creado_en DESC);

-- Verticales autorizadas a mandar hechos a ESTA empresa por el puerto (`POST /api/hechos`). Sin fila → 403.
CREATE TABLE contabilidad.origenes_autorizados (
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  app             text NOT NULL CHECK (app ~ '^[a-z][a-z0-9-]{1,30}$'),
  activo          boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, app)
);

-- ─── 2. Ejercicios y plan de cuentas ────────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.ejercicios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  anio            integer NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
  inicio          date NOT NULL,
  fin             date NOT NULL,
  estado          text NOT NULL CHECK (estado IN ('abierto', 'en_cierre', 'cerrado')),
  ultimo_numero   integer NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, anio),
  CHECK (inicio <= fin)
);

-- El contador correlativo solo avanza (un número dado no se reutiliza jamás).
CREATE OR REPLACE FUNCTION contabilidad.ejercicio_contador_creciente() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ultimo_numero < OLD.ultimo_numero THEN
    RAISE EXCEPTION 'el contador de asientos del ejercicio % no puede retroceder (% → %)', OLD.anio, OLD.ultimo_numero, NEW.ultimo_numero;
  END IF;
  IF NEW.empresa_id <> OLD.empresa_id OR NEW.anio <> OLD.anio OR NEW.inicio <> OLD.inicio OR NEW.fin <> OLD.fin THEN
    RAISE EXCEPTION 'la identidad y las fechas de un ejercicio no se cambian';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ejercicios_contador
  BEFORE UPDATE ON contabilidad.ejercicios
  FOR EACH ROW EXECUTE FUNCTION contabilidad.ejercicio_contador_creciente();

-- Plan por empresa, sembrado en el alta desde SEMILLA_PGC_PYMES (@central/module-contabilidad). No se borra: se desactiva.
CREATE TABLE contabilidad.plan_cuentas (
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  codigo          text NOT NULL CHECK (codigo ~ '^[1-9][0-9]{2,11}$'),
  nombre          text NOT NULL CHECK (btrim(nombre) <> ''),
  grupo           smallint NOT NULL CHECK (grupo BETWEEN 1 AND 9),
  naturaleza      text NOT NULL CHECK (naturaleza IN ('deudora', 'acreedora')),
  admite_apuntes  boolean NOT NULL DEFAULT true,
  activa          boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, codigo),
  CHECK (grupo = substr(codigo, 1, 1)::smallint)
);

-- ─── 3. Hechos (puerto), reglas, asientos y apuntes ─────────────────────────────────────────────────────────────
-- Hecho recibido de una vertical. IDEMPOTENTE por (empresa, app de origen, tipo, ref): el mismo hecho dos veces = un asiento.
-- `tipo` entra en la clave porque una factura y su cobro comparten referencia y son hechos distintos.
CREATE TABLE contabilidad.hechos_contables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  origen_app      text NOT NULL CHECK (origen_app ~ '^[a-z][a-z0-9-]{1,30}$'),
  tipo            text NOT NULL CHECK (tipo IN ('venta', 'compra', 'cobro', 'pago', 'nomina')),
  ref             text NOT NULL CHECK (btrim(ref) <> '' AND length(ref) <= 120),
  fecha           date NOT NULL,
  payload         jsonb NOT NULL,
  -- SHA-256 del payload canónico: misma clave con contenido distinto = 409, nunca se pisa en silencio.
  huella          text NOT NULL CHECK (huella ~ '^[0-9a-f]{64}$'),
  estado          text NOT NULL CHECK (estado IN ('asentado', 'pendiente_de_regla', 'rechazado')),
  motivo          text,
  asiento_id      uuid,
  recibido_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  UNIQUE (empresa_id, origen_app, tipo, ref),
  CHECK ((estado = 'asentado') = (asiento_id IS NOT NULL)),
  CHECK (estado = 'asentado' OR motivo IS NOT NULL)
);
CREATE INDEX idx_hechos_bandeja ON contabilidad.hechos_contables (empresa_id, recibido_en DESC) WHERE estado <> 'asentado';

-- El contenido de un hecho no cambia; solo su estado AVANZA desde la bandeja hacia «asentado» (nunca al revés).
CREATE OR REPLACE FUNCTION contabilidad.hechos_solo_avanza() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contabilidad.hechos_contables no se borra: un hecho nunca se pierde';
  END IF;
  IF NEW.id <> OLD.id OR NEW.empresa_id <> OLD.empresa_id OR NEW.origen_app <> OLD.origen_app OR NEW.tipo <> OLD.tipo
     OR NEW.ref <> OLD.ref OR NEW.fecha <> OLD.fecha OR NEW.payload <> OLD.payload OR NEW.huella <> OLD.huella
     OR NEW.recibido_en <> OLD.recibido_en THEN
    RAISE EXCEPTION 'el contenido del hecho % es inmutable', OLD.id;
  END IF;
  IF OLD.estado = 'asentado' THEN
    RAISE EXCEPTION 'el hecho % ya está asentado: se corrige con un contraasiento', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hechos_solo_avanza
  BEFORE UPDATE OR DELETE ON contabilidad.hechos_contables
  FOR EACH ROW EXECUTE FUNCTION contabilidad.hechos_solo_avanza();

-- Reglas hecho → cuentas por empresa. VERSIONADAS: cambiar una regla = fila nueva (version+1); no reescribe asientos pasados.
-- `cuentas` = parcial de ReglasAsiento[tipo] de @central/module-contabilidad (p. ej. {"ingreso":"705"}). Precedencia:
-- regla de la empresa > plantilla del sector > genérica (REGLAS_PGC).
CREATE TABLE contabilidad.reglas_asiento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  tipo_hecho      text NOT NULL CHECK (tipo_hecho IN ('venta', 'compra', 'cobro', 'pago', 'nomina')),
  cuentas         jsonb NOT NULL CHECK (jsonb_typeof(cuentas) = 'object'),
  version         integer NOT NULL CHECK (version > 0),
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo_hecho, version)
);

CREATE TABLE contabilidad.asientos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  ejercicio       integer NOT NULL,
  numero          integer NOT NULL CHECK (numero > 0),
  fecha           date NOT NULL,
  concepto        text NOT NULL CHECK (btrim(concepto) <> ''),
  origen          text NOT NULL CHECK (origen IN ('manual', 'hecho', 'rectificacion', 'apertura', 'cierre')),
  origen_tipo     text,
  origen_ref      text,
  hecho_id        uuid,
  reversa_de      uuid,
  -- SHA-256 del contenido canónico (fecha, concepto, apuntes): sella lo que se asentó.
  hash            text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id),
  UNIQUE (empresa_id, ejercicio, numero),
  -- Un asiento se rectifica UNA vez (la rectificación de la rectificación es otro asiento nuevo).
  UNIQUE (empresa_id, reversa_de),
  UNIQUE (empresa_id, hecho_id),
  FOREIGN KEY (empresa_id, ejercicio) REFERENCES contabilidad.ejercicios(empresa_id, anio),
  FOREIGN KEY (empresa_id, reversa_de) REFERENCES contabilidad.asientos(empresa_id, id),
  FOREIGN KEY (empresa_id, hecho_id) REFERENCES contabilidad.hechos_contables(empresa_id, id),
  CHECK ((origen = 'hecho') = (hecho_id IS NOT NULL)),
  CHECK ((origen = 'rectificacion') = (reversa_de IS NOT NULL))
);
CREATE INDEX idx_asientos_diario ON contabilidad.asientos (empresa_id, fecha DESC, numero DESC);

ALTER TABLE contabilidad.hechos_contables
  ADD FOREIGN KEY (empresa_id, asiento_id) REFERENCES contabilidad.asientos(empresa_id, id);

CREATE TABLE contabilidad.apuntes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  asiento_id      uuid NOT NULL,
  orden           smallint NOT NULL CHECK (orden > 0),
  cuenta          text NOT NULL,
  debe            bigint NOT NULL CHECK (debe >= 0),
  haber           bigint NOT NULL CHECK (haber >= 0),
  documento       text,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, asiento_id, orden),
  FOREIGN KEY (empresa_id, asiento_id) REFERENCES contabilidad.asientos(empresa_id, id),
  FOREIGN KEY (empresa_id, cuenta) REFERENCES contabilidad.plan_cuentas(empresa_id, codigo),
  -- Debe XOR haber: exactamente uno mayor que cero.
  CHECK ((debe > 0) <> (haber > 0))
);
CREATE INDEX idx_apuntes_mayor ON contabilidad.apuntes (empresa_id, cuenta);

-- Asiento: fecha dentro de un ejercicio ABIERTO de la misma empresa.
CREATE OR REPLACE FUNCTION contabilidad.asiento_en_ejercicio_abierto() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE e record;
BEGIN
  SELECT estado, inicio, fin INTO e FROM contabilidad.ejercicios
   WHERE empresa_id = NEW.empresa_id AND anio = NEW.ejercicio;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe el ejercicio % de la empresa', NEW.ejercicio;
  END IF;
  IF e.estado <> 'abierto' THEN
    RAISE EXCEPTION 'el ejercicio % está %: no admite asientos', NEW.ejercicio, e.estado;
  END IF;
  IF NEW.fecha < e.inicio OR NEW.fecha > e.fin THEN
    RAISE EXCEPTION 'la fecha % queda fuera del ejercicio % (% .. %)', NEW.fecha, NEW.ejercicio, e.inicio, e.fin;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_asientos_ejercicio_abierto
  BEFORE INSERT ON contabilidad.asientos
  FOR EACH ROW EXECUTE FUNCTION contabilidad.asiento_en_ejercicio_abierto();

-- Apunte: solo a cuentas hoja y activas del plan de la empresa.
CREATE OR REPLACE FUNCTION contabilidad.apunte_en_cuenta_hoja() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE c record;
BEGIN
  SELECT admite_apuntes, activa INTO c FROM contabilidad.plan_cuentas
   WHERE empresa_id = NEW.empresa_id AND codigo = NEW.cuenta;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'la cuenta % no existe en el plan de la empresa', NEW.cuenta;
  END IF;
  IF NOT c.admite_apuntes OR NOT c.activa THEN
    RAISE EXCEPTION 'la cuenta % no admite apuntes (no es hoja o está desactivada)', NEW.cuenta;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_apuntes_cuenta_hoja
  BEFORE INSERT ON contabilidad.apuntes
  FOR EACH ROW EXECUTE FUNCTION contabilidad.apunte_en_cuenta_hoja();

-- CUADRE al COMMIT (diferido): ≥ 2 apuntes y Σ debe = Σ haber. Salta tanto por el asiento como por cada apunte.
CREATE OR REPLACE FUNCTION contabilidad.comprobar_cuadre() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_asiento uuid;
  d bigint;
  h bigint;
  n integer;
BEGIN
  v_asiento := CASE WHEN TG_TABLE_NAME = 'asientos' THEN NEW.id ELSE NEW.asiento_id END;
  SELECT coalesce(sum(debe), 0), coalesce(sum(haber), 0), count(*) INTO d, h, n
    FROM contabilidad.apuntes WHERE empresa_id = NEW.empresa_id AND asiento_id = v_asiento;
  IF n < 2 THEN
    RAISE EXCEPTION 'el asiento % necesita al menos 2 apuntes (tiene %)', v_asiento, n;
  END IF;
  IF d <> h THEN
    RAISE EXCEPTION 'asiento % descuadrado: debe % ≠ haber %', v_asiento, d, h;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER trg_asientos_cuadre
  AFTER INSERT ON contabilidad.asientos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION contabilidad.comprobar_cuadre();
CREATE CONSTRAINT TRIGGER trg_apuntes_cuadre
  AFTER INSERT ON contabilidad.apuntes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION contabilidad.comprobar_cuadre();

-- ─── 4. Auditoría y consentimiento (separado y fechado) ─────────────────────────────────────────────────────────
CREATE TABLE contabilidad.auditoria (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  usuario_id      uuid,
  -- 'usuario' | 'operador' | 'puerto:<app>'
  actor           text NOT NULL CHECK (actor ~ '^(usuario|operador|puerto:[a-z][a-z0-9-]{1,30})$'),
  accion          text NOT NULL,
  entidad         text NOT NULL,
  entidad_id      text,
  detalle         jsonb,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_entidad ON contabilidad.auditoria (empresa_id, entidad, entidad_id, creado_en DESC);

-- Puente con seguros (7bis): consentimiento EXPLÍCITO, SEPARADO y FECHADO (RGPD art. 6.1.a / 7.4). La casilla nace sin marcar
-- (no hay fila = no hay consentimiento) y el servicio no depende de ella. Solo-añadir; única modificación = la retirada.
CREATE TABLE contabilidad.consentimiento_seguros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  usuario_id      uuid NOT NULL REFERENCES contabilidad.usuarios(id),
  finalidad       text NOT NULL CHECK (finalidad = 'oportunidades_seguros'),
  texto           text NOT NULL CHECK (btrim(texto) <> ''),
  version_texto   text NOT NULL CHECK (btrim(version_texto) <> ''),
  otorgado_en     timestamptz NOT NULL DEFAULT now(),
  retirado_en     timestamptz,
  motivo_retirada text,
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CHECK (retirado_en IS NULL OR retirado_en >= otorgado_en)
);
-- Como mucho un consentimiento VIGENTE por empresa y finalidad.
CREATE UNIQUE INDEX ux_consentimiento_vigente ON contabilidad.consentimiento_seguros (empresa_id, finalidad) WHERE retirado_en IS NULL;

CREATE OR REPLACE FUNCTION contabilidad.consentimiento_solo_retirada() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'contabilidad.consentimiento_seguros es solo-añadir: no se borra (retira con retirado_en)';
  END IF;
  IF OLD.retirado_en IS NOT NULL THEN
    RAISE EXCEPTION 'consentimiento % ya retirado: no se modifica', OLD.id;
  END IF;
  IF NEW.id <> OLD.id OR NEW.empresa_id <> OLD.empresa_id OR NEW.usuario_id <> OLD.usuario_id OR NEW.finalidad <> OLD.finalidad
     OR NEW.texto <> OLD.texto OR NEW.version_texto <> OLD.version_texto OR NEW.otorgado_en <> OLD.otorgado_en
     OR NEW.retirado_en IS NULL THEN
    RAISE EXCEPTION 'consentimiento %: solo se admite registrar la retirada', OLD.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_consentimiento_solo_retirada
  BEFORE UPDATE OR DELETE ON contabilidad.consentimiento_seguros
  FOR EACH ROW EXECUTE FUNCTION contabilidad.consentimiento_solo_retirada();

-- ─── 5. Inmutables: UPDATE/DELETE/TRUNCATE prohibidos por trigger (además del REVOKE de abajo) ────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['asientos', 'apuntes', 'auditoria', 'reglas_asiento'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_inmutable BEFORE UPDATE OR DELETE ON contabilidad.%I
                    FOR EACH ROW EXECUTE FUNCTION contabilidad.prohibir_cambios()', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_sin_truncate BEFORE TRUNCATE ON contabilidad.%I
                    FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios()', t, t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hechos_contables', 'consentimiento_seguros'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_sin_truncate BEFORE TRUNCATE ON contabilidad.%I
                    FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios()', t, t);
  END LOOP;
END $$;

-- ─── 6. actualizado_en, RLS FORZADO y políticas (bucle sobre TODAS las tablas del schema) ─────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'contabilidad' LOOP
    IF t NOT IN ('asientos', 'apuntes', 'auditoria', 'reglas_asiento') THEN
      EXECUTE format('CREATE TRIGGER trg_%s_actualizado_en BEFORE UPDATE ON contabilidad.%I
                      FOR EACH ROW EXECUTE FUNCTION contabilidad.tocar_actualizado_en()', t, t);
    END IF;
    EXECUTE format('ALTER TABLE contabilidad.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE contabilidad.%I FORCE ROW LEVEL SECURITY', t);
    IF t = 'empresas' THEN
      EXECUTE 'CREATE POLICY empresas_por_empresa ON contabilidad.empresas
                 USING (id = contabilidad.empresa_actual()) WITH CHECK (id = contabilidad.empresa_actual())';
    ELSIF t = 'usuarios' THEN
      -- Un usuario es visible desde una empresa solo si está vinculado a ella (el gestor de 3 empresas se ve en las 3).
      EXECUTE 'CREATE POLICY usuarios_de_la_empresa ON contabilidad.usuarios
                 USING (EXISTS (SELECT 1 FROM contabilidad.usuario_empresas ue
                                 WHERE ue.usuario_id = usuarios.id AND ue.empresa_id = contabilidad.empresa_actual()))';
    ELSIF t = 'acceso_otps' THEN
      -- Sin empresa (se pide antes de saberla) y sin datos de nadie: solo hashes HMAC. El rol no tiene DELETE.
      EXECUTE 'CREATE POLICY acceso_otps_app ON contabilidad.acceso_otps USING (true) WITH CHECK (true)';
    ELSE
      EXECUTE format('CREATE POLICY %I ON contabilidad.%I
                        USING (empresa_id = contabilidad.empresa_actual()) WITH CHECK (empresa_id = contabilidad.empresa_actual())',
                     t || '_por_empresa', t);
    END IF;
  END LOOP;
END $$;

-- ─── 7. Funciones SECURITY DEFINER (lo que se hace SIN empresa fijada). search_path fijo + REVOKE de PUBLIC ────────
-- Alta de la FILA de la empresa (solo el operador, `POST /api/operador/empresas`). Idempotente por NIF.
CREATE OR REPLACE FUNCTION contabilidad.alta_empresa(
  p_nif text, p_razon_social text, p_forma text, p_sector text, p_logo_url text, p_color text)
RETURNS TABLE (o_id uuid, o_creado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_nif IS NULL OR btrim(coalesce(p_razon_social, '')) = '' THEN
    RAISE EXCEPTION 'faltan el NIF o la razón social';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('contabilidad.alta_empresa:' || p_nif));
  SELECT e.id INTO v_id FROM contabilidad.empresas e WHERE e.nif = p_nif;
  IF FOUND THEN
    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;
  INSERT INTO contabilidad.empresas (nif, razon_social, forma, sector, logo_url, color_primario)
    VALUES (p_nif, btrim(p_razon_social), p_forma, p_sector, p_logo_url, p_color) RETURNING empresas.id INTO v_id;
  RETURN QUERY SELECT v_id, true;
END $$;

-- Usuario por correo: lo localiza o lo crea (no reactiva uno dado de baja). Devuelve SOLO el id.
CREATE OR REPLACE FUNCTION contabilidad.alta_usuario(p_email text, p_nombre text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
BEGIN
  IF v_email = '' OR btrim(coalesce(p_nombre, '')) = '' THEN
    RAISE EXCEPTION 'faltan el correo o el nombre';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('contabilidad.alta_usuario:' || v_email));
  SELECT u.id INTO v_id FROM contabilidad.usuarios u WHERE u.email = v_email;
  IF FOUND THEN
    RETURN v_id;
  END IF;
  INSERT INTO contabilidad.usuarios (email, nombre) VALUES (v_email, btrim(p_nombre)) RETURNING usuarios.id INTO v_id;
  RETURN v_id;
END $$;

-- Login: usuario ACTIVO por correo (id, nombre, versión de sesión). Nada de empresas aquí.
CREATE OR REPLACE FUNCTION contabilidad.usuario_por_email(p_email text)
RETURNS TABLE (o_id uuid, o_nombre text, o_sv integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
  SELECT u.id, u.nombre, u.sesion_version FROM contabilidad.usuarios u
   WHERE u.email = lower(btrim(p_email)) AND u.activo
$$;

-- Selector de empresa: las empresas ACTIVAS a las que el usuario ACTIVO tiene vínculo ACTIVO.
CREATE OR REPLACE FUNCTION contabilidad.empresas_de_usuario(p_usuario uuid)
RETURNS TABLE (o_empresa uuid, o_razon_social text, o_rol text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
  SELECT e.id, e.razon_social, ue.rol
    FROM contabilidad.usuario_empresas ue
    JOIN contabilidad.empresas e ON e.id = ue.empresa_id
    JOIN contabilidad.usuarios u ON u.id = ue.usuario_id
   WHERE ue.usuario_id = p_usuario AND ue.activo AND e.activo AND u.activo
   ORDER BY e.razon_social
$$;

-- Revalidación de la sesión EN CADA PETICIÓN: rol vigente si (usuario activo, misma versión de sesión, vínculo activo,
-- empresa activa); NULL en cualquier otro caso (fail-closed). Revocar el acceso de un gestor corta de inmediato.
CREATE OR REPLACE FUNCTION contabilidad.sesion_vigente(p_usuario uuid, p_empresa uuid, p_sv integer)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
  SELECT ue.rol
    FROM contabilidad.usuarios u
    JOIN contabilidad.usuario_empresas ue ON ue.usuario_id = u.id
    JOIN contabilidad.empresas e ON e.id = ue.empresa_id
   WHERE u.id = p_usuario AND u.activo AND u.sesion_version = p_sv
     AND ue.empresa_id = p_empresa AND ue.activo AND e.activo
$$;

-- ¿Sigue vigente la sesión SIN empresa elegida todavía (paso del selector)?
CREATE OR REPLACE FUNCTION contabilidad.usuario_vigente(p_usuario uuid, p_sv integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM contabilidad.usuarios u WHERE u.id = p_usuario AND u.activo AND u.sesion_version = p_sv)
$$;

-- «Salir»: sube la versión de sesión (toda cookie anterior de ese usuario deja de valer).
CREATE OR REPLACE FUNCTION contabilidad.cerrar_sesiones(p_usuario uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
  UPDATE contabilidad.usuarios SET sesion_version = sesion_version + 1 WHERE id = p_usuario
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'contabilidad.alta_empresa(text, text, text, text, text, text)',
    'contabilidad.alta_usuario(text, text)',
    'contabilidad.usuario_por_email(text)',
    'contabilidad.empresas_de_usuario(uuid)',
    'contabilidad.sesion_vigente(uuid, uuid, integer)',
    'contabilidad.usuario_vigente(uuid, integer)',
    'contabilidad.cerrar_sesiones(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO prisma_contabilidad', f);
  END LOOP;
END $$;

-- ─── 8. Permisos MÍNIMOS del rol (nada de GRANT ALL) ────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA contabilidad TO prisma_contabilidad;
GRANT EXECUTE ON FUNCTION contabilidad.empresa_actual() TO prisma_contabilidad;

-- Empresas y usuarios: solo lectura (altas por las funciones de arriba).
GRANT SELECT ON contabilidad.empresas, contabilidad.usuarios TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.usuario_empresas TO prisma_contabilidad;
GRANT UPDATE (rol, activo, revocado_en, actualizado_en) ON contabilidad.usuario_empresas TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.acceso_otps TO prisma_contabilidad;
GRANT UPDATE (intentos, usado_en, envio, actualizado_en) ON contabilidad.acceso_otps TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.origenes_autorizados TO prisma_contabilidad;
GRANT UPDATE (activo, actualizado_en) ON contabilidad.origenes_autorizados TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.ejercicios TO prisma_contabilidad;
GRANT UPDATE (ultimo_numero, actualizado_en) ON contabilidad.ejercicios TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.plan_cuentas TO prisma_contabilidad;
GRANT UPDATE (nombre, admite_apuntes, activa, actualizado_en) ON contabilidad.plan_cuentas TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.hechos_contables TO prisma_contabilidad;
GRANT UPDATE (estado, motivo, asiento_id, actualizado_en) ON contabilidad.hechos_contables TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.consentimiento_seguros TO prisma_contabilidad;
GRANT UPDATE (retirado_en, motivo_retirada, actualizado_en) ON contabilidad.consentimiento_seguros TO prisma_contabilidad;
-- Solo-añadir: SELECT + INSERT, sin UPDATE ni DELETE (el trigger lo impide también a quien tenga más privilegios).
GRANT SELECT, INSERT ON contabilidad.asientos, contabilidad.apuntes, contabilidad.auditoria, contabilidad.reglas_asiento
  TO prisma_contabilidad;
-- Ningún DELETE ni TRUNCATE en ninguna tabla.
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA contabilidad FROM prisma_contabilidad;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────────────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'contabilidad' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);   → 0 filas
-- SELECT rolbypassrls FROM pg_roles WHERE rolname = 'prisma_contabilidad';                                        → false
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.asientos', 'UPDATE');                          → false
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.apuntes', 'DELETE');                           → false
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.empresas', 'INSERT');                          → false
-- Prueba de aislamiento con el rol real (dos empresas de prueba A y B, en una transacción que se deshace):
--   BEGIN; SET LOCAL ROLE prisma_contabilidad; SELECT set_config('contabilidad.empresa_id', '<A>', true);
--   SELECT count(*) FROM contabilidad.asientos WHERE empresa_id = '<B>';                                          → 0
--   ROLLBACK;
