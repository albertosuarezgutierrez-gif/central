-- «MI EMPRESA» — schema `herramientas` + rol `prisma_herramientas` (F1). Spec: docs/superpowers/specs/2026-11-07-mi-empresa-herramientas.md
--
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` (Alberto). Orden: 0001 → 0002 (plantilla v1). No toca NINGÚN otro schema.
--    Tablas sin IF NOT EXISTS: se aplica UNA vez. La contraseña del rol la pone el operador en el MISMO paso que la
--    DATABASE_URL del proyecto Vercel `empresa`:  ALTER ROLE prisma_herramientas WITH PASSWORD <gestor de secretos>.
--
-- Diseño:
--   · «Mi empresa» sabe QUÉ está contratado y firmado; cada app sigue sabiendo QUIÉN entra en ella (usuario_empresas). Este
--     rol NO tiene GRANT en ningún otro schema (contabilidad, rrhh, taller, seguros, public): cepo en apps/empresa/test.
--   · RLS ACTIVADO y FORZADO en TODAS las tablas. El panel fija `herramientas.persona_id` (LOCAL a la transacción, lib/rls.ts):
--     una persona solo ve las cuentas de las que es miembro ACTIVO. Sin ajuste → NULL → cero filas (falla cerrado).
--   · El rol solo LEE (SELECT filtrado por RLS) salvo `acceso_otp` (hashes). TODA escritura va por funciones SECURITY DEFINER
--     con search_path fijo y comprobaciones propias: `firmar_version`/`dar_acceso`/`registrar_traspaso` (con persona fijada,
--     comprueban el rol en BD) y `op_*` (puerto del operador; la ruta exige antes el Bearer HERRAMIENTAS_OPERADOR_SECRET).
--   · INMUTABLE en BD (no solo en código): `plantilla`, `firma`, `evento`, `traspaso_emitido`, `contrato` → trigger que
--     rechaza UPDATE/DELETE/TRUNCATE. `contrato_version`: su contenido no cambia; solo `estado` por la lista blanca de abajo.
--     `envio`: se reserva `enviando` ANTES de llamar al proveedor y se resuelve UNA vez (aceptado|fallido); nunca se borra.
--     Hash en CHECK: `sha256` de plantilla, documento y certificado = sha256 del texto guardado (no se puede guardar uno falso).
--   · NULL = «no se sabe» (p. ej. `ref_externa` sin rellenar), nunca «no hay».

BEGIN;

-- ─── 0. Rol (LOGIN, NOBYPASSRLS, sin contraseña: inerte hasta que el operador la ponga) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prisma_herramientas') THEN
    CREATE ROLE prisma_herramientas WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE prisma_herramientas WITH NOBYPASSRLS;
ALTER ROLE prisma_herramientas SET search_path = herramientas;

CREATE SCHEMA IF NOT EXISTS herramientas;
REVOKE ALL ON SCHEMA herramientas FROM PUBLIC;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA herramientas FROM %I', r);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION herramientas.persona_actual() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('herramientas.persona_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION herramientas.prohibir_cambios() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'herramientas.%: tabla inmutable (% prohibido)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

-- ─── 1. Tablas ──────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE herramientas.cuenta (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cif                 text NOT NULL UNIQUE CHECK (cif ~ '^[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J]$'),
  razon_social        text NOT NULL CHECK (length(btrim(razon_social)) > 1),
  domicilio_via       text,
  domicilio_numero    text,
  domicilio_resto     text,
  domicilio_cp        text CHECK (domicilio_cp IS NULL OR domicilio_cp ~ '^[0-9]{5}$'),
  domicilio_municipio text,
  domicilio_provincia text,
  marca_acento        text CHECK (marca_acento IS NULL OR marca_acento ~ '^#[0-9a-f]{6}$'),
  marca_logo_url      text CHECK (marca_logo_url IS NULL OR marca_logo_url ~ '^https://'),
  activo              boolean NOT NULL DEFAULT true,
  creada_por          text NOT NULL,
  creada_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now()
);

-- Solo autentica. Identidad = correo verificado (nunca se funde por nombre).
CREATE TABLE herramientas.persona (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre              text NOT NULL CHECK (length(btrim(nombre)) > 1),
  email_verificado_en timestamptz,
  sesion_version      integer NOT NULL DEFAULT 0 CHECK (sesion_version >= 0),
  creada_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE herramientas.cuenta_miembro (
  cuenta_id              uuid NOT NULL REFERENCES herramientas.cuenta(id),
  persona_id             uuid NOT NULL REFERENCES herramientas.persona(id),
  rol                    text NOT NULL CHECK (rol IN ('dueno', 'admin', 'consulta', 'empleado')),
  titulo_representacion  text CHECK (titulo_representacion IN ('administrador', 'apoderado')),
  -- NIF del FIRMANTE (solo dueño): el contrato lo exige en «Reunidos». Persona física → dato personal mínimo y necesario.
  nif                    text CHECK (nif IS NULL OR nif ~ '^([XYZ]|[0-9])[0-9]{7}[A-Z]$'),
  estado                 text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'revocado')),
  -- De dónde salió el rol: {"fuente":"relacion_correduria","cliente_id":…,"relacionado_id":…,"tipo":"Administración"} | {"fuente":"manual"}.
  -- Solo ids y el tipo de relación (sin datos de pólizas). Lo escribe el operador con su clic; si la relación cambia, plataforma
  -- AVISA («¿actualizar rol?») y nunca cambia el rol sola. NULL = no consta.
  origen                 jsonb CHECK (origen IS NULL OR origen ? 'fuente'),
  alta_por               text NOT NULL,
  alta_en                timestamptz NOT NULL DEFAULT now(),
  revocado_en            timestamptz,
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, persona_id),
  CHECK (rol = 'dueno' OR (nif IS NULL AND titulo_representacion IS NULL))
);
-- UN solo dueño activo por cuenta.
CREATE UNIQUE INDEX cuenta_un_dueno ON herramientas.cuenta_miembro (cuenta_id) WHERE rol = 'dueno' AND estado = 'activo';

CREATE TABLE herramientas.plantilla (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL CHECK (codigo = 'encargo_tratamiento'),
  version      text NOT NULL,
  estado       text NOT NULL CHECK (estado IN ('borrador', 'revisada')),
  texto_md     text NOT NULL,
  sha256       text NOT NULL CHECK (sha256 = encode(sha256(convert_to(texto_md, 'UTF8')), 'hex')),
  publicada_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (codigo, version)
);

CREATE TABLE herramientas.contrato (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL UNIQUE REFERENCES herramientas.cuenta(id),
  numero    text NOT NULL UNIQUE,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE herramientas.contrato_version (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id             uuid NOT NULL REFERENCES herramientas.contrato(id),
  n                       integer NOT NULL CHECK (n >= 1),
  plantilla_id            uuid NOT NULL REFERENCES herramientas.plantilla(id),
  herramientas            text[] NOT NULL CHECK (cardinality(herramientas) >= 1),
  variables               jsonb NOT NULL,
  documento_html          text NOT NULL,
  documento_sha256        text NOT NULL CHECK (documento_sha256 = encode(sha256(convert_to(documento_html, 'UTF8')), 'hex')),
  destinatario_persona_id uuid NOT NULL REFERENCES herramientas.persona(id),
  destinatario_email      text NOT NULL,
  estado                  text NOT NULL DEFAULT 'enviado' CHECK (estado IN ('enviado', 'firmado', 'anulado', 'caducado', 'sustituido')),
  emitida_por             text NOT NULL,
  emitida_en              timestamptz NOT NULL DEFAULT now(),
  caduca_en               timestamptz NOT NULL,
  estado_cambiado_en      timestamptz,
  UNIQUE (contrato_id, n),
  CHECK (caduca_en > emitida_en)
);
-- Como mucho UNA versión pendiente de firma por contrato.
CREATE UNIQUE INDEX contrato_una_pendiente ON herramientas.contrato_version (contrato_id) WHERE estado = 'enviado';

CREATE TABLE herramientas.cuenta_herramienta (
  cuenta_id           uuid NOT NULL REFERENCES herramientas.cuenta(id),
  herramienta         text NOT NULL CHECK (herramienta IN ('contabilidad', 'rrhh', 'nominas', 'taller', 'portal_proveedores')),
  -- id de la empresa EN la app (contabilidad.empresas.id, rrhh.empresas.id, taller.talleres.id). NULL = aún no se sabe.
  ref_externa         uuid,
  estado              text NOT NULL DEFAULT 'apagada' CHECK (estado IN ('apagada', 'pendiente_firma', 'activa', 'suspendida', 'retirada')),
  contrato_version_id uuid REFERENCES herramientas.contrato_version(id),
  activada_por        text,
  activada_en         timestamptz,
  propagacion         text NOT NULL DEFAULT 'no_aplica' CHECK (propagacion IN ('no_aplica', 'pendiente', 'hecha', 'fallida')),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, herramienta),
  -- Nada se contrata sin saber a qué empresa de la app apunta.
  CHECK (estado = 'apagada' OR ref_externa IS NOT NULL),
  CHECK (estado <> 'activa' OR contrato_version_id IS NOT NULL)
);

-- Qué herramientas puede abrir cada miembro NO dueño (el dueño ve todo lo contratado).
CREATE TABLE herramientas.miembro_herramienta (
  cuenta_id     uuid NOT NULL,
  persona_id    uuid NOT NULL,
  herramienta   text NOT NULL,
  -- Rol ESPECÍFICO en la app (taller: recepcion/mecanico…; contabilidad: gestor…). NULL = el de por defecto del rol general
  -- (core-herramientas/roles.ts: MAPEO_POR_DEFECTO). Lo valida la app de Mi empresa contra ROLES_APP antes de escribirlo.
  rol_app       text CHECK (rol_app IS NULL OR rol_app ~ '^[a-z_]{2,30}$'),
  -- ¿Se ha pedido ya ese rol a la app por su puerto de operador? Sin respuesta = 'fallida', nunca 'hecha' (F1: 'pendiente').
  propagacion   text NOT NULL DEFAULT 'pendiente' CHECK (propagacion IN ('pendiente', 'hecha', 'fallida', 'no_aplica')),
  concedido_por text NOT NULL,
  concedido_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, persona_id, herramienta),
  FOREIGN KEY (cuenta_id, persona_id) REFERENCES herramientas.cuenta_miembro(cuenta_id, persona_id),
  FOREIGN KEY (cuenta_id, herramienta) REFERENCES herramientas.cuenta_herramienta(cuenta_id, herramienta)
);

CREATE TABLE herramientas.firma (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_version_id    uuid NOT NULL UNIQUE REFERENCES herramientas.contrato_version(id),
  persona_id             uuid NOT NULL REFERENCES herramientas.persona(id),
  nombre_confirmado      text NOT NULL,
  titulo_representacion  text NOT NULL CHECK (titulo_representacion IN ('administrador', 'apoderado')),
  metodo                 text NOT NULL CHECK (metodo = 'otp_email'),
  ip                     text NOT NULL,
  user_agent             text NOT NULL,
  firmado_en             timestamptz NOT NULL,
  documento_sha256       text NOT NULL,
  evidencia              jsonb NOT NULL,
  certificado_html       text NOT NULL,
  certificado_sha256     text NOT NULL CHECK (certificado_sha256 = encode(sha256(convert_to(certificado_html, 'UTF8')), 'hex')),
  creado_en              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE herramientas.envio (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_version_id uuid NOT NULL REFERENCES herramientas.contrato_version(id),
  tipo                text NOT NULL CHECK (tipo IN ('contrato', 'recordatorio')),
  intento             integer NOT NULL CHECK (intento >= 1),
  destinatario        text NOT NULL,
  -- Prueba del OK: quién pulsó (email del operador en plataforma). Sin él no hay envío.
  confirmado_por      text NOT NULL CHECK (length(btrim(confirmado_por)) > 3),
  estado              text NOT NULL DEFAULT 'enviando' CHECK (estado IN ('enviando', 'aceptado', 'fallido')),
  proveedor_id        text,
  error               text,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  resuelto_en         timestamptz,
  UNIQUE (contrato_version_id, tipo, intento)
);

-- Auditoría: sin datos de empleados ni de negocio; como mucho el correo del actor.
CREATE TABLE herramientas.evento (
  id        bigserial PRIMARY KEY,
  cuenta_id uuid REFERENCES herramientas.cuenta(id),
  actor     text NOT NULL,
  accion    text NOT NULL,
  detalle   jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE herramientas.acceso_otp (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposito   text NOT NULL CHECK (proposito IN ('acceso', 'firma')),
  email_hash  text NOT NULL,
  codigo_hash text NOT NULL,
  ip          text NOT NULL,
  envio       text NOT NULL CHECK (envio IN ('no_enviado', 'enviado', 'fallido')),
  intentos    integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  usado_en    timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acceso_otp_email ON herramientas.acceso_otp (email_hash, creado_en DESC);
CREATE INDEX acceso_otp_ip ON herramientas.acceso_otp (ip, creado_en DESC);

-- Solo jti/aud/persona/exp: el token no se guarda.
CREATE TABLE herramientas.traspaso_emitido (
  jti        uuid PRIMARY KEY,
  persona_id uuid NOT NULL REFERENCES herramientas.persona(id),
  cuenta_id  uuid NOT NULL REFERENCES herramientas.cuenta(id),
  aud        text NOT NULL CHECK (aud IN ('contabilidad', 'rrhh', 'taller')),
  herramienta text NOT NULL,
  exp        timestamptz NOT NULL,
  emitido_en timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Inmutabilidad ───────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plantilla', 'firma', 'evento', 'traspaso_emitido', 'contrato'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_inmutable BEFORE UPDATE OR DELETE ON herramientas.%I
                    FOR EACH ROW EXECUTE FUNCTION herramientas.prohibir_cambios()', t, t);
  END LOOP;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'herramientas' LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_sin_truncate BEFORE TRUNCATE ON herramientas.%I
                    FOR EACH STATEMENT EXECUTE FUNCTION herramientas.prohibir_cambios()', t, t);
  END LOOP;
END $$;

-- contrato_version: SOLO cambia `estado` (+ su sello), y SOLO por la lista blanca (misma que core-herramientas/estados.ts).
CREATE OR REPLACE FUNCTION herramientas.version_solo_estado() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'herramientas.contrato_version: no se borra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.contrato_id, NEW.n, NEW.plantilla_id, NEW.herramientas, NEW.variables, NEW.documento_html, NEW.documento_sha256,
      NEW.destinatario_persona_id, NEW.destinatario_email, NEW.emitida_por, NEW.emitida_en, NEW.caduca_en)
     IS DISTINCT FROM
     (OLD.id, OLD.contrato_id, OLD.n, OLD.plantilla_id, OLD.herramientas, OLD.variables, OLD.documento_html, OLD.documento_sha256,
      OLD.destinatario_persona_id, OLD.destinatario_email, OLD.emitida_por, OLD.emitida_en, OLD.caduca_en) THEN
    RAISE EXCEPTION 'herramientas.contrato_version: el contenido emitido es inmutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF (OLD.estado, NEW.estado) NOT IN (
      -- TRANSICIONES-VERSION:INICIO
      ('enviado', 'firmado'), ('enviado', 'anulado'), ('enviado', 'caducado'), ('firmado', 'sustituido')
      -- TRANSICIONES-VERSION:FIN
    ) THEN
      RAISE EXCEPTION 'herramientas.contrato_version: transición % → % no permitida', OLD.estado, NEW.estado USING ERRCODE = 'check_violation';
    END IF;
    NEW.estado_cambiado_en := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_contrato_version_solo_estado BEFORE UPDATE OR DELETE ON herramientas.contrato_version
  FOR EACH ROW EXECUTE FUNCTION herramientas.version_solo_estado();

-- envio: se resuelve UNA vez (enviando → aceptado|fallido); nada más cambia; nunca se borra.
CREATE OR REPLACE FUNCTION herramientas.envio_una_resolucion() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'herramientas.envio: no se borra' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.estado <> 'enviando' OR NEW.estado NOT IN ('aceptado', 'fallido')
     OR (NEW.id, NEW.contrato_version_id, NEW.tipo, NEW.intento, NEW.destinatario, NEW.confirmado_por, NEW.creado_en)
        IS DISTINCT FROM (OLD.id, OLD.contrato_version_id, OLD.tipo, OLD.intento, OLD.destinatario, OLD.confirmado_por, OLD.creado_en) THEN
    RAISE EXCEPTION 'herramientas.envio: solo se resuelve una vez' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.resuelto_en := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_envio_una_resolucion BEFORE UPDATE OR DELETE ON herramientas.envio
  FOR EACH ROW EXECUTE FUNCTION herramientas.envio_una_resolucion();

CREATE OR REPLACE FUNCTION herramientas.tocar_actualizado_en() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN NEW.actualizado_en := now(); RETURN NEW; END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cuenta', 'persona', 'cuenta_miembro', 'cuenta_herramienta'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_actualizado_en BEFORE UPDATE ON herramientas.%I
                    FOR EACH ROW EXECUTE FUNCTION herramientas.tocar_actualizado_en()', t, t);
  END LOOP;
END $$;

-- ─── 3. RLS FORZADO en todas las tablas + políticas de LECTURA por persona ─────────────────────────────────────────
-- es_miembro: SECURITY DEFINER para que la política de una tabla no dependa de la RLS de otra (sin recursión).
CREATE OR REPLACE FUNCTION herramientas.es_miembro(p_cuenta uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
  AS $$ SELECT EXISTS (SELECT 1 FROM herramientas.cuenta_miembro m JOIN herramientas.cuenta c ON c.id = m.cuenta_id
                        WHERE m.cuenta_id = p_cuenta AND m.persona_id = herramientas.persona_actual()
                          AND m.estado = 'activo' AND c.activo) $$;
CREATE OR REPLACE FUNCTION herramientas.comparte_cuenta(p_persona uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
  AS $$ SELECT p_persona = herramientas.persona_actual()
            OR EXISTS (SELECT 1 FROM herramientas.cuenta_miembro m WHERE m.persona_id = p_persona AND m.estado = 'activo'
                         AND herramientas.es_miembro(m.cuenta_id)) $$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'herramientas' LOOP
    EXECUTE format('ALTER TABLE herramientas.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE herramientas.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
CREATE POLICY cuenta_de_miembro ON herramientas.cuenta FOR SELECT USING (herramientas.es_miembro(id));
CREATE POLICY miembro_de_miembro ON herramientas.cuenta_miembro FOR SELECT USING (herramientas.es_miembro(cuenta_id));
CREATE POLICY herramienta_de_miembro ON herramientas.cuenta_herramienta FOR SELECT USING (herramientas.es_miembro(cuenta_id));
CREATE POLICY concesion_de_miembro ON herramientas.miembro_herramienta FOR SELECT USING (herramientas.es_miembro(cuenta_id));
CREATE POLICY contrato_de_miembro ON herramientas.contrato FOR SELECT USING (herramientas.es_miembro(cuenta_id));
CREATE POLICY version_de_miembro ON herramientas.contrato_version FOR SELECT
  USING (EXISTS (SELECT 1 FROM herramientas.contrato c WHERE c.id = contrato_id AND herramientas.es_miembro(c.cuenta_id)));
CREATE POLICY firma_de_miembro ON herramientas.firma FOR SELECT
  USING (EXISTS (SELECT 1 FROM herramientas.contrato_version v JOIN herramientas.contrato c ON c.id = v.contrato_id
                  WHERE v.id = contrato_version_id AND herramientas.es_miembro(c.cuenta_id)));
CREATE POLICY persona_visible ON herramientas.persona FOR SELECT USING (herramientas.comparte_cuenta(id));
CREATE POLICY plantilla_publica ON herramientas.plantilla FOR SELECT USING (true);
-- Sin persona todavía (se pide antes de entrar) y sin datos de nadie: solo hashes HMAC.
CREATE POLICY otp_app ON herramientas.acceso_otp USING (true) WITH CHECK (true);
-- `envio`, `evento`, `traspaso_emitido`: SIN política para el rol → invisibles; solo las funciones SECURITY DEFINER.

-- ─── 4. Funciones de la PERSONA (persona fijada por conPersona; el rol se comprueba AQUÍ, no en la petición) ────────
-- Persona por correo (login). Devuelve SOLO id, nombre y versión de sesión.
CREATE OR REPLACE FUNCTION herramientas.persona_por_email(p_email text)
RETURNS TABLE (o_id uuid, o_nombre text, o_sv integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ SELECT p.id, p.nombre, p.sesion_version FROM herramientas.persona p
       WHERE p.email = lower(btrim(p_email))
         AND EXISTS (SELECT 1 FROM herramientas.cuenta_miembro m JOIN herramientas.cuenta c ON c.id = m.cuenta_id
                      WHERE m.persona_id = p.id AND m.estado = 'activo' AND c.activo) $$;

CREATE OR REPLACE FUNCTION herramientas.marcar_email_verificado(p_persona uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ UPDATE herramientas.persona SET email_verificado_en = now() WHERE id = p_persona AND email_verificado_en IS NULL $$;

CREATE OR REPLACE FUNCTION herramientas.persona_vigente(p_persona uuid, p_sv integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM herramientas.persona WHERE id = p_persona AND sesion_version = p_sv) $$;

CREATE OR REPLACE FUNCTION herramientas.cerrar_sesiones(p_persona uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ UPDATE herramientas.persona SET sesion_version = sesion_version + 1 WHERE id = p_persona $$;

-- Rol vigente de la persona FIJADA en una cuenta (o NULL).
CREATE OR REPLACE FUNCTION herramientas.rol_en(p_cuenta uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ SELECT m.rol FROM herramientas.cuenta_miembro m JOIN herramientas.cuenta c ON c.id = m.cuenta_id
       WHERE m.cuenta_id = p_cuenta AND m.persona_id = herramientas.persona_actual() AND m.estado = 'activo' AND c.activo $$;

-- FIRMA. Todo en UNA transacción (la del llamante): si algo falla, nada queda «firmado».
CREATE OR REPLACE FUNCTION herramientas.firmar_version(
  p_version uuid, p_nombre text, p_titulo text, p_ip text, p_ua text, p_sha_visto text, p_firmado_en timestamptz,
  p_evidencia jsonb, p_certificado_html text, p_certificado_sha text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE
  v_persona uuid := herramientas.persona_actual();
  v record;
  v_firma uuid;
BEGIN
  IF v_persona IS NULL THEN RAISE EXCEPTION 'sin_persona' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT cv.*, c.cuenta_id INTO v FROM herramientas.contrato_version cv JOIN herramientas.contrato c ON c.id = cv.contrato_id
   WHERE cv.id = p_version FOR UPDATE OF cv;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_no_existe' USING ERRCODE = 'no_data_found'; END IF;
  IF herramientas.rol_en(v.cuenta_id) IS DISTINCT FROM 'dueno' THEN
    RAISE EXCEPTION 'solo_firma_el_dueno' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v.destinatario_persona_id <> v_persona THEN
    RAISE EXCEPTION 'version_de_otro_firmante' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v.estado <> 'enviado' OR v.caduca_en <= now() THEN RAISE EXCEPTION 'version_no_firmable' USING ERRCODE = 'check_violation'; END IF;
  IF p_sha_visto IS DISTINCT FROM v.documento_sha256 THEN RAISE EXCEPTION 'documento_cambiado' USING ERRCODE = 'check_violation'; END IF;
  IF p_firmado_en < now() - interval '5 minutes' OR p_firmado_en > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'sello_de_tiempo_fuera_de_rango' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO herramientas.firma (contrato_version_id, persona_id, nombre_confirmado, titulo_representacion, metodo, ip, user_agent,
                                  firmado_en, documento_sha256, evidencia, certificado_html, certificado_sha256)
    VALUES (p_version, v_persona, btrim(p_nombre), p_titulo, 'otp_email', p_ip, left(coalesce(p_ua, ''), 400), p_firmado_en,
            v.documento_sha256, p_evidencia, p_certificado_html, p_certificado_sha)
    RETURNING id INTO v_firma;
  UPDATE herramientas.contrato_version SET estado = 'sustituido' WHERE contrato_id = v.contrato_id AND estado = 'firmado';
  UPDATE herramientas.contrato_version SET estado = 'firmado' WHERE id = p_version;
  UPDATE herramientas.cuenta_herramienta
     SET estado = CASE WHEN estado = 'suspendida' THEN 'suspendida' ELSE 'activa' END,
         contrato_version_id = p_version,
         activada_en = coalesce(activada_en, now()), activada_por = coalesce(activada_por, 'firma'),
         propagacion = CASE WHEN herramienta = 'nominas' AND propagacion <> 'hecha' THEN 'pendiente' ELSE propagacion END
   WHERE cuenta_id = v.cuenta_id AND herramienta = ANY (v.herramientas);
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    SELECT v.cuenta_id, p.email, 'contrato_firmado', jsonb_build_object('version', v.n, 'herramientas', v.herramientas)
      FROM herramientas.persona p WHERE p.id = v_persona;
  RETURN v_firma;
END $$;

-- Dar acceso (solo el DUEÑO de la cuenta). Identidad por CORREO: si la persona ya existe se reutiliza (su nombre no se
-- sobreescribe); nunca se funde por nombre. Solo herramientas contratadas (activa o pendiente). No envía nada.
CREATE OR REPLACE FUNCTION herramientas.dar_acceso(p_cuenta uuid, p_email text, p_nombre text, p_rol text, p_herramientas text[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_actor text;
BEGIN
  IF herramientas.rol_en(p_cuenta) IS DISTINCT FROM 'dueno' THEN
    RAISE EXCEPTION 'solo_el_dueno_da_acceso' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT email INTO v_actor FROM herramientas.persona WHERE id = herramientas.persona_actual();
  RETURN herramientas._conceder(p_cuenta, p_email, p_nombre, p_rol, p_herramientas, v_actor);
END $$;

CREATE OR REPLACE FUNCTION herramientas.quitar_acceso(p_cuenta uuid, p_persona uuid, p_herramienta text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_actor text;
BEGIN
  IF herramientas.rol_en(p_cuenta) IS DISTINCT FROM 'dueno' THEN
    RAISE EXCEPTION 'solo_el_dueno_quita_acceso' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT email INTO v_actor FROM herramientas.persona WHERE id = herramientas.persona_actual();
  PERFORM herramientas._retirar(p_cuenta, p_persona, p_herramienta, v_actor);
END $$;

-- Salto a una herramienta: se RECOMPRUEBA en BD (miembro activo, herramienta activa, concesión si no es dueño) y se apunta el jti.
CREATE OR REPLACE FUNCTION herramientas.registrar_traspaso(p_cuenta uuid, p_herramienta text, p_jti uuid, p_aud text, p_exp timestamptz)
RETURNS TABLE (o_ref uuid, o_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE
  v_persona uuid := herramientas.persona_actual();
  v_rol text := herramientas.rol_en(p_cuenta);
  v_ref uuid;
BEGIN
  -- El empleado no salta desde aquí (entra en cada app con su acceso de empleado).
  IF v_rol IS NULL OR v_rol = 'empleado' THEN RAISE EXCEPTION 'sin_acceso' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT ch.ref_externa INTO v_ref FROM herramientas.cuenta_herramienta ch
   WHERE ch.cuenta_id = p_cuenta AND ch.herramienta = p_herramienta AND ch.estado = 'activa' AND ch.ref_externa IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'herramienta_no_activa' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF v_rol = 'admin' AND NOT EXISTS (SELECT 1 FROM herramientas.miembro_herramienta mh
       WHERE mh.cuenta_id = p_cuenta AND mh.persona_id = v_persona AND mh.herramienta = p_herramienta) THEN
    RAISE EXCEPTION 'sin_acceso_a_la_herramienta' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO herramientas.traspaso_emitido (jti, persona_id, cuenta_id, aud, herramienta, exp)
    VALUES (p_jti, v_persona, p_cuenta, p_aud, p_herramienta, p_exp);
  RETURN QUERY SELECT v_ref, p.email FROM herramientas.persona p WHERE p.id = v_persona;
END $$;

-- ─── 5. Funciones internas (NO se conceden al rol) ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION herramientas._persona(p_email text, p_nombre text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_email text := lower(btrim(coalesce(p_email, ''))); v_id uuid;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(btrim(coalesce(p_nombre, ''))) < 2 THEN
    RAISE EXCEPTION 'faltan_correo_o_nombre' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('herramientas.persona:' || v_email));
  SELECT id INTO v_id FROM herramientas.persona WHERE email = v_email;
  IF FOUND THEN RETURN v_id; END IF;
  INSERT INTO herramientas.persona (email, nombre) VALUES (v_email, btrim(p_nombre)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION herramientas._conceder(p_cuenta uuid, p_email text, p_nombre text, p_rol text, p_herramientas text[], p_actor text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_persona uuid; v_rol text; h text;
BEGIN
  IF p_rol NOT IN ('admin', 'consulta', 'empleado') THEN RAISE EXCEPTION 'rol_invalido' USING ERRCODE = 'check_violation'; END IF;
  v_persona := herramientas._persona(p_email, p_nombre);
  SELECT rol INTO v_rol FROM herramientas.cuenta_miembro WHERE cuenta_id = p_cuenta AND persona_id = v_persona;
  IF v_rol = 'dueno' THEN RAISE EXCEPTION 'es_el_dueno' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO herramientas.cuenta_miembro (cuenta_id, persona_id, rol, estado, alta_por)
    VALUES (p_cuenta, v_persona, p_rol, 'activo', p_actor)
    ON CONFLICT (cuenta_id, persona_id) DO UPDATE SET rol = EXCLUDED.rol, estado = 'activo', revocado_en = NULL;
  FOREACH h IN ARRAY coalesce(p_herramientas, ARRAY[]::text[]) LOOP
    IF NOT EXISTS (SELECT 1 FROM herramientas.cuenta_herramienta WHERE cuenta_id = p_cuenta AND herramienta = h
                     AND estado IN ('activa', 'pendiente_firma')) THEN
      RAISE EXCEPTION 'herramienta_no_contratada: %', h USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO herramientas.miembro_herramienta (cuenta_id, persona_id, herramienta, concedido_por)
      VALUES (p_cuenta, v_persona, h, p_actor) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'acceso_concedido', jsonb_build_object('persona', v_persona, 'rol', p_rol, 'herramientas', p_herramientas));
  RETURN v_persona;
END $$;

-- Quitar UNA herramienta (p_herramienta) o TODO el acceso (NULL → miembro revocado). El dueño no se revoca por aquí.
CREATE OR REPLACE FUNCTION herramientas._retirar(p_cuenta uuid, p_persona uuid, p_herramienta text, p_actor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM herramientas.cuenta_miembro WHERE cuenta_id = p_cuenta AND persona_id = p_persona AND rol = 'dueno') THEN
    RAISE EXCEPTION 'es_el_dueno' USING ERRCODE = 'check_violation';
  END IF;
  IF p_herramienta IS NULL THEN
    DELETE FROM herramientas.miembro_herramienta WHERE cuenta_id = p_cuenta AND persona_id = p_persona;
    UPDATE herramientas.cuenta_miembro SET estado = 'revocado', revocado_en = now() WHERE cuenta_id = p_cuenta AND persona_id = p_persona;
  ELSE
    DELETE FROM herramientas.miembro_herramienta WHERE cuenta_id = p_cuenta AND persona_id = p_persona AND herramienta = p_herramienta;
  END IF;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'acceso_retirado', jsonb_build_object('persona', p_persona, 'herramienta', p_herramienta));
END $$;

-- ─── 6. Puerto del OPERADOR (la ruta exige Bearer HERRAMIENTAS_OPERADOR_SECRET; p_actor = email del operador) ───────
CREATE OR REPLACE FUNCTION herramientas.op_alta_cuenta(
  p_cif text, p_razon text, p_via text, p_numero text, p_resto text, p_cp text, p_municipio text, p_provincia text,
  p_acento text, p_logo text, p_actor text)
RETURNS TABLE (o_id uuid, o_creada boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('herramientas.cuenta:' || p_cif));
  SELECT id INTO v_id FROM herramientas.cuenta WHERE cif = p_cif;
  IF FOUND THEN
    -- Completa/corrige los datos de presentación y domicilio (no el CIF). NULL = no cambia (COALESCE), nunca borra un dato.
    UPDATE herramientas.cuenta SET razon_social = coalesce(nullif(btrim(p_razon), ''), razon_social),
      domicilio_via = coalesce(p_via, domicilio_via), domicilio_numero = coalesce(p_numero, domicilio_numero),
      domicilio_resto = coalesce(p_resto, domicilio_resto), domicilio_cp = coalesce(p_cp, domicilio_cp),
      domicilio_municipio = coalesce(p_municipio, domicilio_municipio), domicilio_provincia = coalesce(p_provincia, domicilio_provincia),
      marca_acento = coalesce(p_acento, marca_acento), marca_logo_url = coalesce(p_logo, marca_logo_url)
     WHERE id = v_id;
    INSERT INTO herramientas.evento (cuenta_id, actor, accion) VALUES (v_id, p_actor, 'cuenta_actualizada');
    RETURN QUERY SELECT v_id, false; RETURN;
  END IF;
  INSERT INTO herramientas.cuenta (cif, razon_social, domicilio_via, domicilio_numero, domicilio_resto, domicilio_cp,
                                   domicilio_municipio, domicilio_provincia, marca_acento, marca_logo_url, creada_por)
    VALUES (p_cif, btrim(p_razon), p_via, p_numero, p_resto, p_cp, p_municipio, p_provincia, p_acento, p_logo, p_actor)
    RETURNING id INTO v_id;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion) VALUES (v_id, p_actor, 'cuenta_creada');
  RETURN QUERY SELECT v_id, true;
END $$;

-- Dueño (firmante con poderes). Cambiar de dueño revoca al anterior y ANULA la versión pendiente (se reemite al nuevo: nuevo OK).
CREATE OR REPLACE FUNCTION herramientas.op_fijar_dueno(p_cuenta uuid, p_email text, p_nombre text, p_nif text, p_titulo text, p_actor text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_persona uuid; v_anterior uuid;
BEGIN
  -- Título y NIF pueden quedar NULL («no se sabe»): la emisión los exige (variablesContrato → «Falta: …»).
  IF p_titulo IS NOT NULL AND p_titulo NOT IN ('administrador', 'apoderado') THEN RAISE EXCEPTION 'titulo_invalido' USING ERRCODE = 'check_violation'; END IF;
  v_persona := herramientas._persona(p_email, p_nombre);
  PERFORM pg_advisory_xact_lock(hashtext('herramientas.dueno:' || p_cuenta::text));
  SELECT persona_id INTO v_anterior FROM herramientas.cuenta_miembro WHERE cuenta_id = p_cuenta AND rol = 'dueno' AND estado = 'activo';
  IF v_anterior IS NOT NULL AND v_anterior <> v_persona THEN
    UPDATE herramientas.cuenta_miembro SET estado = 'revocado', revocado_en = now() WHERE cuenta_id = p_cuenta AND persona_id = v_anterior;
    UPDATE herramientas.contrato_version cv SET estado = 'anulado' FROM herramientas.contrato c
     WHERE c.id = cv.contrato_id AND c.cuenta_id = p_cuenta AND cv.estado = 'enviado';
  END IF;
  DELETE FROM herramientas.miembro_herramienta WHERE cuenta_id = p_cuenta AND persona_id = v_persona;
  INSERT INTO herramientas.cuenta_miembro (cuenta_id, persona_id, rol, titulo_representacion, nif, estado, alta_por)
    VALUES (p_cuenta, v_persona, 'dueno', p_titulo, upper(nullif(btrim(p_nif), '')), 'activo', p_actor)
    ON CONFLICT (cuenta_id, persona_id) DO UPDATE
      SET rol = 'dueno',
          titulo_representacion = coalesce(EXCLUDED.titulo_representacion, herramientas.cuenta_miembro.titulo_representacion),
          nif = coalesce(EXCLUDED.nif, herramientas.cuenta_miembro.nif), estado = 'activo', revocado_en = NULL;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'dueno_fijado', jsonb_build_object('persona', v_persona, 'anterior', v_anterior));
  RETURN v_persona;
END $$;

-- ref_externa por herramienta (no la contrata: deja la fila `apagada` si no existía).
CREATE OR REPLACE FUNCTION herramientas.op_fijar_ref(p_cuenta uuid, p_herramienta text, p_ref uuid, p_actor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
BEGIN
  -- Misma ref que ya tiene: no-op (la semilla y el operador pueden repetir).
  IF EXISTS (SELECT 1 FROM herramientas.cuenta_herramienta WHERE cuenta_id = p_cuenta AND herramienta = p_herramienta AND ref_externa = p_ref) THEN
    RETURN;
  END IF;
  INSERT INTO herramientas.cuenta_herramienta (cuenta_id, herramienta, ref_externa)
    VALUES (p_cuenta, p_herramienta, p_ref)
    ON CONFLICT (cuenta_id, herramienta) DO UPDATE SET ref_externa = EXCLUDED.ref_externa
      WHERE herramientas.cuenta_herramienta.estado IN ('apagada', 'retirada');
  IF NOT FOUND THEN RAISE EXCEPTION 'ref_no_editable_con_herramienta_contratada' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'ref_fijada', jsonb_build_object('herramienta', p_herramienta));
END $$;

-- EMISIÓN de la versión n+1 + reserva del envío, en UNA transacción. `p_confirmo` = el correo que el operador VIO en el
-- modal: si el dueño cambió entre la vista previa y el clic → 'destinatario_cambiado' (la ruta responde 409).
CREATE OR REPLACE FUNCTION herramientas.op_emitir_version(
  p_cuenta uuid, p_herramientas text[], p_plantilla uuid, p_variables jsonb, p_html text, p_sha text, p_confirmo text,
  p_caduca timestamptz, p_actor text)
RETURNS TABLE (o_version uuid, o_n integer, o_envio uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE
  v_contrato uuid; v_n integer; v_version uuid; v_envio uuid; v_dueno uuid; v_email text; v_cif text; h text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('herramientas.emitir:' || p_cuenta::text));
  SELECT m.persona_id, p.email INTO v_dueno, v_email FROM herramientas.cuenta_miembro m JOIN herramientas.persona p ON p.id = m.persona_id
   WHERE m.cuenta_id = p_cuenta AND m.rol = 'dueno' AND m.estado = 'activo';
  IF v_dueno IS NULL THEN RAISE EXCEPTION 'sin_dueno' USING ERRCODE = 'check_violation'; END IF;
  IF lower(btrim(coalesce(p_confirmo, ''))) <> v_email THEN RAISE EXCEPTION 'destinatario_cambiado' USING ERRCODE = 'check_violation'; END IF;
  IF p_variables -> 'firmante' ->> 'email' IS DISTINCT FROM v_email THEN RAISE EXCEPTION 'variables_de_otro_dueno' USING ERRCODE = 'check_violation'; END IF;
  FOREACH h IN ARRAY p_herramientas LOOP
    IF NOT EXISTS (SELECT 1 FROM herramientas.cuenta_herramienta WHERE cuenta_id = p_cuenta AND herramienta = h AND ref_externa IS NOT NULL) THEN
      RAISE EXCEPTION 'falta_ref_externa: %', h USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  SELECT cif INTO v_cif FROM herramientas.cuenta WHERE id = p_cuenta;
  INSERT INTO herramientas.contrato (cuenta_id, numero) VALUES (p_cuenta, 'ENC-' || v_cif) ON CONFLICT (cuenta_id) DO NOTHING;
  SELECT id INTO v_contrato FROM herramientas.contrato WHERE cuenta_id = p_cuenta;
  -- La pendiente anterior (si la hay) se anula: se firma lo último que se envió.
  UPDATE herramientas.contrato_version SET estado = 'anulado' WHERE contrato_id = v_contrato AND estado = 'enviado';
  SELECT coalesce(max(n), 0) + 1 INTO v_n FROM herramientas.contrato_version WHERE contrato_id = v_contrato;
  IF (p_variables ->> 'version')::int IS DISTINCT FROM v_n THEN RAISE EXCEPTION 'version_desfasada' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO herramientas.contrato_version (contrato_id, n, plantilla_id, herramientas, variables, documento_html, documento_sha256,
                                             destinatario_persona_id, destinatario_email, emitida_por, caduca_en)
    VALUES (v_contrato, v_n, p_plantilla, p_herramientas, p_variables, p_html, p_sha, v_dueno, v_email, p_actor, p_caduca)
    RETURNING id INTO v_version;
  UPDATE herramientas.cuenta_herramienta
     SET estado = CASE WHEN estado IN ('apagada', 'retirada', 'pendiente_firma') THEN 'pendiente_firma' ELSE estado END,
         activada_por = CASE WHEN estado IN ('apagada', 'retirada') THEN p_actor ELSE activada_por END
   WHERE cuenta_id = p_cuenta AND herramienta = ANY (p_herramientas);
  INSERT INTO herramientas.envio (contrato_version_id, tipo, intento, destinatario, confirmado_por)
    VALUES (v_version, 'contrato', 1, v_email, p_actor) RETURNING id INTO v_envio;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'contrato_emitido', jsonb_build_object('version', v_n, 'herramientas', p_herramientas));
  RETURN QUERY SELECT v_version, v_n, v_envio;
END $$;

-- Reenvío (del contrato que no salió) o recordatorio: SOLO con clic del operador (= nuevo OK). Versión firmable y mismo dueño.
CREATE OR REPLACE FUNCTION herramientas.op_reservar_envio(p_version uuid, p_tipo text, p_confirmo text, p_actor text)
RETURNS TABLE (o_envio uuid, o_destinatario text, o_razon text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v record; v_email text; v_intento integer; v_envio uuid;
BEGIN
  SELECT cv.*, c.cuenta_id INTO v FROM herramientas.contrato_version cv JOIN herramientas.contrato c ON c.id = cv.contrato_id
   WHERE cv.id = p_version FOR UPDATE OF cv;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_no_existe' USING ERRCODE = 'no_data_found'; END IF;
  IF v.estado <> 'enviado' OR v.caduca_en <= now() THEN RAISE EXCEPTION 'version_no_firmable' USING ERRCODE = 'check_violation'; END IF;
  SELECT p.email INTO v_email FROM herramientas.persona p WHERE p.id = v.destinatario_persona_id;
  IF lower(btrim(coalesce(p_confirmo, ''))) <> v_email THEN RAISE EXCEPTION 'destinatario_cambiado' USING ERRCODE = 'check_violation'; END IF;
  SELECT coalesce(max(intento), 0) + 1 INTO v_intento FROM herramientas.envio WHERE contrato_version_id = p_version AND tipo = p_tipo;
  INSERT INTO herramientas.envio (contrato_version_id, tipo, intento, destinatario, confirmado_por)
    VALUES (p_version, p_tipo, v_intento, v_email, p_actor) RETURNING id INTO v_envio;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (v.cuenta_id, p_actor, 'envio_reservado', jsonb_build_object('version', v.n, 'tipo', p_tipo, 'intento', v_intento));
  RETURN QUERY SELECT v_envio, v_email, (SELECT razon_social FROM herramientas.cuenta WHERE id = v.cuenta_id);
END $$;

CREATE OR REPLACE FUNCTION herramientas.op_resolver_envio(p_envio uuid, p_estado text, p_proveedor_id text, p_error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ UPDATE herramientas.envio SET estado = p_estado, proveedor_id = left(p_proveedor_id, 200), error = left(p_error, 300)
       WHERE id = p_envio AND estado = 'enviando' $$;

CREATE OR REPLACE FUNCTION herramientas.op_fijar_origen(p_cuenta uuid, p_persona uuid, p_origen jsonb, p_actor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
BEGIN
  UPDATE herramientas.cuenta_miembro SET origen = p_origen WHERE cuenta_id = p_cuenta AND persona_id = p_persona;
  IF NOT FOUND THEN RAISE EXCEPTION 'miembro_no_existe' USING ERRCODE = 'no_data_found'; END IF;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'origen_fijado', jsonb_build_object('persona', p_persona, 'fuente', p_origen ->> 'fuente'));
END $$;

-- Rol ESPECÍFICO de un miembro en UNA herramienta (NULL = volver al de por defecto). La ruta lo valida contra ROLES_APP.
CREATE OR REPLACE FUNCTION herramientas.op_fijar_rol_app(p_cuenta uuid, p_persona uuid, p_herramienta text, p_rol_app text, p_actor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
BEGIN
  UPDATE herramientas.miembro_herramienta SET rol_app = p_rol_app, propagacion = 'pendiente'
   WHERE cuenta_id = p_cuenta AND persona_id = p_persona AND herramienta = p_herramienta;
  IF NOT FOUND THEN RAISE EXCEPTION 'miembro_no_existe' USING ERRCODE = 'no_data_found'; END IF;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle)
    VALUES (p_cuenta, p_actor, 'rol_app_fijado', jsonb_build_object('persona', p_persona, 'herramienta', p_herramienta, 'rol_app', p_rol_app));
END $$;

CREATE OR REPLACE FUNCTION herramientas.op_anular_version(p_version uuid, p_actor text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
DECLARE v_cuenta uuid;
BEGIN
  UPDATE herramientas.contrato_version cv SET estado = 'anulado' FROM herramientas.contrato c
   WHERE c.id = cv.contrato_id AND cv.id = p_version AND cv.estado = 'enviado' RETURNING c.cuenta_id INTO v_cuenta;
  IF v_cuenta IS NULL THEN RAISE EXCEPTION 'version_no_anulable' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO herramientas.evento (cuenta_id, actor, accion, detalle) VALUES (v_cuenta, p_actor, 'contrato_anulado', jsonb_build_object('version', p_version));
END $$;

CREATE OR REPLACE FUNCTION herramientas.op_dar_acceso(p_cuenta uuid, p_email text, p_nombre text, p_rol text, p_herramientas text[], p_actor text)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ SELECT herramientas._conceder(p_cuenta, p_email, p_nombre, p_rol, p_herramientas, p_actor) $$;

CREATE OR REPLACE FUNCTION herramientas.op_quitar_acceso(p_cuenta uuid, p_persona uuid, p_herramienta text, p_actor text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ SELECT herramientas._retirar(p_cuenta, p_persona, p_herramienta, p_actor) $$;

-- Lecturas del operador: SOLO estado del servicio (dos-ventanas §6: Alberto no ve datos de negocio de la cuenta).
-- Lecturas del operador: SOLO estado del servicio (dos-ventanas §6: Alberto no ve datos de negocio de la cuenta).
CREATE OR REPLACE FUNCTION herramientas._ficha(p_cuenta uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'cif', c.cif, 'razon_social', c.razon_social, 'activo', c.activo, 'marca_acento', c.marca_acento,
    'domicilio', jsonb_build_object('via', c.domicilio_via, 'numero', c.domicilio_numero, 'resto', c.domicilio_resto, 'cp', c.domicilio_cp,
                                    'municipio', c.domicilio_municipio, 'provincia', c.domicilio_provincia),
    'miembros', (SELECT coalesce(jsonb_agg(jsonb_build_object('persona_id', p.id, 'email', p.email, 'nombre', p.nombre, 'rol', m.rol,
                    'titulo', m.titulo_representacion, 'nif', m.nif, 'estado', m.estado, 'origen', m.origen,
                    'herramientas', (SELECT coalesce(jsonb_agg(mh.herramienta ORDER BY mh.herramienta), '[]'::jsonb) FROM herramientas.miembro_herramienta mh
                                      WHERE mh.cuenta_id = m.cuenta_id AND mh.persona_id = m.persona_id),
                    'roles_app', (SELECT coalesce(jsonb_object_agg(mh.herramienta, jsonb_build_object('rol_app', mh.rol_app, 'propagacion', mh.propagacion)), '{}'::jsonb)
                                    FROM herramientas.miembro_herramienta mh WHERE mh.cuenta_id = m.cuenta_id AND mh.persona_id = m.persona_id)) ORDER BY m.rol DESC, p.nombre), '[]'::jsonb)
                   FROM herramientas.cuenta_miembro m JOIN herramientas.persona p ON p.id = m.persona_id WHERE m.cuenta_id = c.id AND m.estado = 'activo'),
    'herramientas', (SELECT coalesce(jsonb_agg(jsonb_build_object('herramienta', ch.herramienta, 'ref_externa', ch.ref_externa, 'estado', ch.estado,
                       'propagacion', ch.propagacion, 'activada_en', ch.activada_en) ORDER BY ch.herramienta), '[]'::jsonb)
                     FROM herramientas.cuenta_herramienta ch WHERE ch.cuenta_id = c.id),
    'versiones', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', cv.id, 'n', cv.n, 'estado', cv.estado, 'herramientas', cv.herramientas,
                    'destinatario', cv.destinatario_email, 'emitida_en', cv.emitida_en, 'caduca_en', cv.caduca_en, 'sha256', cv.documento_sha256,
                    'firmada_en', f.firmado_en, 'certificado_sha256', f.certificado_sha256,
                    'envios', (SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', e.tipo, 'intento', e.intento, 'estado', e.estado,
                                 'confirmado_por', e.confirmado_por, 'creado_en', e.creado_en, 'error', e.error) ORDER BY e.creado_en), '[]'::jsonb)
                               FROM herramientas.envio e WHERE e.contrato_version_id = cv.id)) ORDER BY cv.n DESC), '[]'::jsonb)
                  FROM herramientas.contrato ct JOIN herramientas.contrato_version cv ON cv.contrato_id = ct.id
                  LEFT JOIN herramientas.firma f ON f.contrato_version_id = cv.id WHERE ct.cuenta_id = c.id),
    'eventos', (SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'creado_en') DESC), '[]'::jsonb) FROM (
                  SELECT jsonb_build_object('actor', ev.actor, 'accion', ev.accion, 'creado_en', ev.creado_en) AS x
                    FROM herramientas.evento ev WHERE ev.cuenta_id = c.id ORDER BY ev.creado_en DESC LIMIT 30) t)
  ) FROM herramientas.cuenta c WHERE c.id = p_cuenta
$$;

CREATE OR REPLACE FUNCTION herramientas.op_listar() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(herramientas._ficha(c.id) ORDER BY c.razon_social), '[]'::jsonb) FROM herramientas.cuenta c
$$;

CREATE OR REPLACE FUNCTION herramientas.op_ficha(p_cuenta uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$ SELECT herramientas._ficha(p_cuenta) $$;

-- Datos para EMITIR (cuenta + dueño + plantilla vigente + nº de la siguiente versión). Sin escribir nada.
CREATE OR REPLACE FUNCTION herramientas.op_datos_emision(p_cuenta uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
  SELECT jsonb_build_object(
    'cuenta', jsonb_build_object('id', c.id, 'cif', c.cif, 'razon_social', c.razon_social, 'via', c.domicilio_via, 'numero', c.domicilio_numero,
                                 'resto', c.domicilio_resto, 'cp', c.domicilio_cp, 'municipio', c.domicilio_municipio, 'provincia', c.domicilio_provincia),
    'dueno', (SELECT jsonb_build_object('persona_id', p.id, 'email', p.email, 'nombre', p.nombre, 'nif', m.nif, 'titulo', m.titulo_representacion)
                FROM herramientas.cuenta_miembro m JOIN herramientas.persona p ON p.id = m.persona_id
               WHERE m.cuenta_id = c.id AND m.rol = 'dueno' AND m.estado = 'activo'),
    'plantilla', (SELECT jsonb_build_object('id', pl.id, 'version', pl.version, 'estado', pl.estado, 'texto', pl.texto_md, 'sha256', pl.sha256)
                    FROM herramientas.plantilla pl WHERE pl.codigo = 'encargo_tratamiento' ORDER BY pl.publicada_en DESC LIMIT 1),
    'siguiente', (SELECT coalesce(max(cv.n), 0) + 1 FROM herramientas.contrato ct JOIN herramientas.contrato_version cv ON cv.contrato_id = ct.id
                   WHERE ct.cuenta_id = c.id),
    'vigentes', (SELECT coalesce(jsonb_agg(ch.herramienta), '[]'::jsonb) FROM herramientas.cuenta_herramienta ch
                  WHERE ch.cuenta_id = c.id AND ch.estado IN ('activa', 'suspendida')),
    'con_ref', (SELECT coalesce(jsonb_agg(ch.herramienta), '[]'::jsonb) FROM herramientas.cuenta_herramienta ch
                 WHERE ch.cuenta_id = c.id AND ch.ref_externa IS NOT NULL)
  ) FROM herramientas.cuenta c WHERE c.id = p_cuenta
$$;

CREATE OR REPLACE FUNCTION herramientas.op_documento(p_version uuid, p_tipo text) RETURNS TABLE (o_html text, o_sha text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = herramientas, pg_temp
AS $$
  SELECT CASE WHEN p_tipo = 'certificado' THEN f.certificado_html ELSE cv.documento_html END,
         CASE WHEN p_tipo = 'certificado' THEN f.certificado_sha256 ELSE cv.documento_sha256 END
    FROM herramientas.contrato_version cv LEFT JOIN herramientas.firma f ON f.contrato_version_id = cv.id WHERE cv.id = p_version
$$;

-- ─── 7. Permisos MÍNIMOS ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'herramientas' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
  END LOOP;
  -- Al rol: las de la persona y las del operador. NUNCA las internas (_persona, _conceder, _retirar, _ficha).
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'herramientas' AND p.proname NOT LIKE '\_%' AND p.prokind = 'f'
              AND p.proname NOT IN ('prohibir_cambios', 'version_solo_estado', 'envio_una_resolucion', 'tocar_actualizado_en') LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO prisma_herramientas', f);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA herramientas TO prisma_herramientas;
REVOKE ALL ON ALL TABLES IN SCHEMA herramientas FROM prisma_herramientas;
GRANT SELECT ON herramientas.cuenta, herramientas.persona, herramientas.cuenta_miembro, herramientas.cuenta_herramienta,
                herramientas.miembro_herramienta, herramientas.plantilla, herramientas.contrato, herramientas.contrato_version,
                herramientas.firma TO prisma_herramientas;
GRANT SELECT, INSERT ON herramientas.acceso_otp TO prisma_herramientas;
GRANT UPDATE (intentos, usado_en) ON herramientas.acceso_otp TO prisma_herramientas;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────────────────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'herramientas' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);   → 0 filas
-- SELECT rolbypassrls FROM pg_roles WHERE rolname = 'prisma_herramientas';                                         → false
-- Cepo de aislamiento entre schemas (debe salir VACÍO):
-- SELECT table_schema, table_name, privilege_type FROM information_schema.role_table_grants
--  WHERE grantee = 'prisma_herramientas' AND table_schema <> 'herramientas';
-- SELECT has_table_privilege('prisma_herramientas', 'herramientas.firma', 'UPDATE');                                → false
-- Inmutabilidad (como postgres, en una transacción que se deshace):
--   BEGIN; UPDATE herramientas.plantilla SET estado = 'revisada';   → ERROR tabla inmutable; ROLLBACK;
-- RLS entre cuentas (persona A no ve la cuenta de B):
--   BEGIN; SET LOCAL ROLE prisma_herramientas; SELECT set_config('herramientas.persona_id', '<A>', true);
--   SELECT count(*) FROM herramientas.cuenta WHERE cif = '<CIF de B>';                                               → 0
--   ROLLBACK;
