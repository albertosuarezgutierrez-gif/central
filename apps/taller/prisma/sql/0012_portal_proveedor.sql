-- Vertical TALLER — 0012: PORTAL DEL PROVEEDOR por enlace personalizado (primer consumidor de @central/module-portal-proveedor).
-- Requiere 0001-0011. IDEMPOTENTE. ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (preview → prod tras OK de Alberto).
--
-- Flujo: pedido → ENLACE 1 (propósito `pedido`) → el proveedor confirma y sube el ALBARÁN → el taller registra la entrada y pulsa
-- «Recepción verificada» → ENLACE 2 (propósito `factura`, alcance = ese albarán) → el proveedor sube la FACTURA (PDF/imagen/XML) →
-- extracción (XML sin IA; PDF/imagen con IA) → case a tres bandas → `lista` (se contabiliza sola) o `revisar` (una persona confirma o
-- corrige). NUNCA se contabiliza nada que no case o no confirme una persona (CHECK `documentos_proveedor_contabilizada_chk`).
--
--  1) `proveedores.nif` (NULL = no se sabe: el case NO casa sin él) · `albaranes.recepcion_verificada_*` · `ot_lineas.aceptada_por`.
--  2) `configuracion.portal_*`: caducidad del enlace, tamaño máximo de subida y TOLERANCIAS del case (editables; defaults ≡
--     TOLERANCIAS_POR_DEFECTO del módulo, cepo test/esquema-sql-0012.test.ts).
--  3) `enlaces_proveedor`: SOLO el HASH SHA-256 del token; alcance = (propósito, pedido | albarán); caduca; revocable; se cierra.
--  4) `documentos_proveedor`: lo que sube el proveedor (ruta del bucket PRIVADO `taller`), extracción, resultado del case y quién confirmó.
--  5) `taller.enlace_proveedor_por_hash()`: SECURITY DEFINER (no hay sesión ni taller antes de resolver el enlace). Valida hash +
--     caducidad + no revocado + no cerrado + taller activo y devuelve SOLO (taller, enlace, propósito). `search_path` fijado y sin PUBLIC.
--     El límite de fallos por IP reutiliza `taller.bloqueos_codigo` (clave `proveedor:<ip>`), como `/c/<token>`.
-- RLS forzado con la política por taller de siempre; FK COMPUESTAS (taller_id, x_id); sin DELETE para el rol de la app.
BEGIN;

-- ─── 1) Columnas en tablas existentes ────────────────────────────────────────
ALTER TABLE taller.proveedores ADD COLUMN IF NOT EXISTS nif text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_nif_chk') THEN
    ALTER TABLE taller.proveedores ADD CONSTRAINT proveedores_nif_chk CHECK (nif IS NULL OR nif ~ '^[0-9A-Z]{5,15}$');
  END IF;
END $$;

ALTER TABLE taller.albaranes ADD COLUMN IF NOT EXISTS recepcion_verificada_en timestamptz;
ALTER TABLE taller.albaranes ADD COLUMN IF NOT EXISTS recepcion_verificada_por uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'albaranes_verificada_por_fk') THEN
    ALTER TABLE taller.albaranes ADD CONSTRAINT albaranes_verificada_por_fk
      FOREIGN KEY (taller_id, recepcion_verificada_por) REFERENCES taller.usuarios_taller(taller_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'albaranes_verificada_chk') THEN
    -- «Recepción verificada» la pulsa UNA PERSONA: hay quién y cuándo, o ninguno de los dos.
    ALTER TABLE taller.albaranes ADD CONSTRAINT albaranes_verificada_chk
      CHECK ((recepcion_verificada_en IS NULL) = (recepcion_verificada_por IS NULL));
  END IF;
END $$;
GRANT UPDATE (recepcion_verificada_en, recepcion_verificada_por) ON taller.albaranes TO prisma_taller;

-- Recambio aceptado DESPUÉS (pantalla «Recambios pendientes de aceptar»): queda quién lo aceptó.
ALTER TABLE taller.ot_lineas ADD COLUMN IF NOT EXISTS aceptada_por uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ot_lineas_aceptada_por_fk') THEN
    ALTER TABLE taller.ot_lineas ADD CONSTRAINT ot_lineas_aceptada_por_fk
      FOREIGN KEY (taller_id, aceptada_por) REFERENCES taller.usuarios_taller(taller_id, id);
  END IF;
END $$;

-- ─── 2) Configuración del portal (editable por el dueño) ─────────────────────
ALTER TABLE taller.configuracion
  ADD COLUMN IF NOT EXISTS portal_enlace_caduca_dias integer NOT NULL DEFAULT 14 CHECK (portal_enlace_caduca_dias BETWEEN 1 AND 90),
  ADD COLUMN IF NOT EXISTS portal_max_mb integer NOT NULL DEFAULT 4 CHECK (portal_max_mb BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS portal_tol_precio_cent integer NOT NULL DEFAULT 1 CHECK (portal_tol_precio_cent BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS portal_tol_precio_pb integer NOT NULL DEFAULT 0 CHECK (portal_tol_precio_pb BETWEEN 0 AND 2000),
  ADD COLUMN IF NOT EXISTS portal_tol_importe_linea_cent integer NOT NULL DEFAULT 1 CHECK (portal_tol_importe_linea_cent BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS portal_tol_total_cent integer NOT NULL DEFAULT 2 CHECK (portal_tol_total_cent BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS portal_tol_cantidad_mil integer NOT NULL DEFAULT 0 CHECK (portal_tol_cantidad_mil BETWEEN 0 AND 1000000);

-- ─── 3) Enlaces ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.enlaces_proveedor (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  proveedor_id   uuid NOT NULL,
  proposito      text NOT NULL CHECK (proposito IN ('pedido', 'factura')),
  pedido_id      uuid,
  albaran_id     uuid,
  token_hash     text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),   -- SHA-256 del token; el token en claro NO se guarda
  creado_por     uuid NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  caduca_en      timestamptz NOT NULL,
  revocado_en    timestamptz,
  revocado_por   uuid,
  cerrado_en     timestamptz,                                          -- cerrado por el flujo (factura subida / recepción completa)
  confirmado_en  timestamptz,                                          -- el proveedor confirmó el pedido
  accesos        integer NOT NULL DEFAULT 0 CHECK (accesos >= 0),
  ultimo_acceso_en timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  CONSTRAINT ux_enlaces_proveedor_token UNIQUE (token_hash),
  FOREIGN KEY (taller_id, proveedor_id) REFERENCES taller.proveedores(taller_id, id),
  FOREIGN KEY (taller_id, pedido_id)    REFERENCES taller.pedidos(taller_id, id),
  FOREIGN KEY (taller_id, albaran_id)   REFERENCES taller.albaranes(taller_id, id),
  FOREIGN KEY (taller_id, creado_por)   REFERENCES taller.usuarios_taller(taller_id, id),
  FOREIGN KEY (taller_id, revocado_por) REFERENCES taller.usuarios_taller(taller_id, id),
  CHECK (caduca_en > creado_en),
  -- Alcance: UN documento por propósito.
  CHECK ((proposito = 'pedido' AND pedido_id IS NOT NULL AND albaran_id IS NULL)
      OR (proposito = 'factura' AND albaran_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_enlaces_proveedor_pedido ON taller.enlaces_proveedor (taller_id, pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enlaces_proveedor_albaran ON taller.enlaces_proveedor (taller_id, albaran_id) WHERE albaran_id IS NOT NULL;
-- Como mucho UN enlace vivo por (documento, propósito): generar otro exige revocar el anterior (la app lo hace en la misma transacción).
CREATE UNIQUE INDEX IF NOT EXISTS ux_enlaces_proveedor_vivo
  ON taller.enlaces_proveedor (taller_id, proposito, coalesce(albaran_id, pedido_id)) WHERE revocado_en IS NULL AND cerrado_en IS NULL;

-- El hash, el alcance y la caducidad no se tocan nunca; revocar/cerrar es definitivo.
CREATE OR REPLACE FUNCTION taller.enlaces_proveedor_inmutables() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'un enlace de proveedor no se borra (se revoca)'; END IF;
  IF NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.proposito IS DISTINCT FROM OLD.proposito
     OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id OR NEW.albaran_id IS DISTINCT FROM OLD.albaran_id
     OR NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id OR NEW.caduca_en IS DISTINCT FROM OLD.caduca_en
     OR NEW.creado_por IS DISTINCT FROM OLD.creado_por THEN
    RAISE EXCEPTION 'el alcance de un enlace de proveedor no se edita';
  END IF;
  IF OLD.revocado_en IS NOT NULL AND NEW.revocado_en IS DISTINCT FROM OLD.revocado_en THEN RAISE EXCEPTION 'enlace ya revocado'; END IF;
  IF OLD.cerrado_en IS NOT NULL AND NEW.cerrado_en IS DISTINCT FROM OLD.cerrado_en THEN RAISE EXCEPTION 'enlace ya cerrado'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enlaces_proveedor_inmutables ON taller.enlaces_proveedor;
CREATE TRIGGER trg_enlaces_proveedor_inmutables
  BEFORE UPDATE OR DELETE ON taller.enlaces_proveedor
  FOR EACH ROW EXECUTE FUNCTION taller.enlaces_proveedor_inmutables();

-- ─── 4) Documentos del proveedor ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.documentos_proveedor (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id          uuid NOT NULL REFERENCES taller.talleres(id) ON DELETE CASCADE,
  enlace_id          uuid NOT NULL,
  proveedor_id       uuid NOT NULL,
  pedido_id          uuid,
  albaran_id         uuid,
  tipo               text NOT NULL CHECK (tipo IN ('albaran', 'factura')),
  ruta               text NOT NULL,                       -- bucket PRIVADO `taller`: <taller>/proveedor/<enlace>/<nombre>-<sha256>.<ext>
  huella_sha256      text NOT NULL CHECK (huella_sha256 ~ '^[0-9a-f]{64}$'),
  mime               text NOT NULL CHECK (mime IN ('application/pdf', 'image/jpeg', 'image/png', 'application/xml')),
  bytes              integer NOT NULL CHECK (bytes > 0),
  nombre             text NOT NULL,                       -- saneado (sanearNombre)
  subido_en          timestamptz NOT NULL DEFAULT now(),
  subido_ip          inet,
  estado             text NOT NULL CHECK (estado IN ('recibido', 'verificado', 'recibida', 'extraida', 'ilegible', 'lista', 'revisar', 'confirmada', 'rechazada', 'contabilizada')),
  extraccion         jsonb,                               -- borrador de factura recibida (NULL = sin extraer)
  extraccion_origen  text CHECK (extraccion_origen IN ('xml', 'ia', 'persona')),
  extraccion_error   text,
  case_cuadra        boolean,                             -- NULL = no casado (≠ false)
  case_resultado     jsonb,
  corregido_por      uuid,
  corregido_en       timestamptz,
  confirmado_por     uuid,
  confirmado_en      timestamptz,
  contabilizado_en   timestamptz,
  nota               text,
  actualizado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  UNIQUE (taller_id, enlace_id, huella_sha256),           -- el mismo fichero dos veces por el mismo enlace no se duplica
  FOREIGN KEY (taller_id, enlace_id)      REFERENCES taller.enlaces_proveedor(taller_id, id),
  FOREIGN KEY (taller_id, proveedor_id)   REFERENCES taller.proveedores(taller_id, id),
  FOREIGN KEY (taller_id, pedido_id)      REFERENCES taller.pedidos(taller_id, id),
  FOREIGN KEY (taller_id, albaran_id)     REFERENCES taller.albaranes(taller_id, id),
  FOREIGN KEY (taller_id, confirmado_por) REFERENCES taller.usuarios_taller(taller_id, id),
  FOREIGN KEY (taller_id, corregido_por)  REFERENCES taller.usuarios_taller(taller_id, id),
  CHECK (ruta LIKE taller_id::text || '/proveedor/%'),
  CHECK ((tipo = 'albaran' AND estado IN ('recibido', 'verificado'))
      OR (tipo = 'factura' AND albaran_id IS NOT NULL AND estado IN ('recibida', 'extraida', 'ilegible', 'lista', 'revisar', 'confirmada', 'rechazada', 'contabilizada'))),
  CONSTRAINT documentos_proveedor_confirmada_chk CHECK (estado <> 'confirmada' OR (confirmado_por IS NOT NULL AND confirmado_en IS NOT NULL)),
  CONSTRAINT documentos_proveedor_lista_chk CHECK (estado <> 'lista' OR case_cuadra IS TRUE),
  -- NUNCA se contabiliza nada que no case o no confirme una persona.
  CONSTRAINT documentos_proveedor_contabilizada_chk CHECK (
    estado <> 'contabilizada' OR (contabilizado_en IS NOT NULL AND (case_cuadra IS TRUE OR confirmado_por IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS idx_documentos_proveedor_albaran ON taller.documentos_proveedor (taller_id, albaran_id) WHERE albaran_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_proveedor_pedido ON taller.documentos_proveedor (taller_id, pedido_id) WHERE pedido_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documentos_proveedor_estado ON taller.documentos_proveedor (taller_id, tipo, estado);

-- Lo que subió el proveedor (fichero, huella, quién/cuándo, a qué documento) no se reescribe; solo avanza su tramitación.
CREATE OR REPLACE FUNCTION taller.documentos_proveedor_inmutables() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'un documento del proveedor no se borra'; END IF;
  IF NEW.ruta IS DISTINCT FROM OLD.ruta OR NEW.huella_sha256 IS DISTINCT FROM OLD.huella_sha256 OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.enlace_id IS DISTINCT FROM OLD.enlace_id OR NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id
     OR NEW.pedido_id IS DISTINCT FROM OLD.pedido_id OR NEW.albaran_id IS DISTINCT FROM OLD.albaran_id
     OR NEW.subido_en IS DISTINCT FROM OLD.subido_en OR NEW.bytes IS DISTINCT FROM OLD.bytes THEN
    RAISE EXCEPTION 'lo que subió el proveedor no se edita';
  END IF;
  IF OLD.estado IN ('contabilizada', 'rechazada') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'documento ya cerrado (%)', OLD.estado;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_documentos_proveedor_inmutables ON taller.documentos_proveedor;
CREATE TRIGGER trg_documentos_proveedor_inmutables
  BEFORE UPDATE OR DELETE ON taller.documentos_proveedor
  FOR EACH ROW EXECUTE FUNCTION taller.documentos_proveedor_inmutables();

-- ─── RLS, actualizado_en y permisos de las tablas nuevas ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['enlaces_proveedor', 'documentos_proveedor'] LOOP
    EXECUTE format('ALTER TABLE taller.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE taller.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'taller' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY %I ON taller.%I USING (taller_id = taller.taller_actual()) WITH CHECK (taller_id = taller.taller_actual())', t || '_por_taller', t);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_actualizado_en ON taller.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_actualizado_en BEFORE UPDATE ON taller.%I FOR EACH ROW EXECUTE FUNCTION taller.tocar_actualizado_en()', t, t);
  END LOOP;
END $$;

REVOKE ALL ON taller.enlaces_proveedor, taller.documentos_proveedor FROM prisma_taller;
GRANT SELECT, INSERT ON taller.enlaces_proveedor, taller.documentos_proveedor TO prisma_taller;
GRANT UPDATE (revocado_en, revocado_por, cerrado_en, confirmado_en, accesos, ultimo_acceso_en, actualizado_en) ON taller.enlaces_proveedor TO prisma_taller;
GRANT UPDATE (estado, extraccion, extraccion_origen, extraccion_error, case_cuadra, case_resultado, corregido_por, corregido_en,
              confirmado_por, confirmado_en, contabilizado_en, nota, actualizado_en) ON taller.documentos_proveedor TO prisma_taller;

-- ─── 5) Resolución pública del enlace (sin sesión) ───────────────────────────
-- Recibe el HASH (el token en claro no viaja a la BD ni a sus logs). Devuelve SOLO ids y propósito; el resto se lee después con
-- `conTaller(taller)` (RLS) y solo del documento del enlace. Sin fila = inexistente, caducado, revocado, cerrado o taller inactivo.
CREATE OR REPLACE FUNCTION taller.enlace_proveedor_por_hash(p_hash text)
RETURNS TABLE (o_taller uuid, o_enlace uuid, o_proposito text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = taller, pg_temp
AS $$
  SELECT e.taller_id, e.id, e.proposito
    FROM taller.enlaces_proveedor e
    JOIN taller.talleres t ON t.id = e.taller_id AND t.activo
   WHERE p_hash ~ '^[0-9a-f]{64}$'
     AND e.token_hash = p_hash
     AND e.caduca_en > now()
     AND e.revocado_en IS NULL
     AND e.cerrado_en IS NULL
   LIMIT 1
$$;
REVOKE ALL ON FUNCTION taller.enlace_proveedor_por_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION taller.enlace_proveedor_por_hash(text) TO prisma_taller;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'taller' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);      → 0 filas
-- SELECT has_function_privilege('anon', 'taller.enlace_proveedor_por_hash(text)', 'EXECUTE');                → f
-- SELECT has_table_privilege('prisma_taller', 'taller.documentos_proveedor', 'DELETE');                       → f
-- SELECT proconfig FROM pg_proc WHERE proname = 'enlace_proveedor_por_hash';                                  → {search_path=taller, pg_temp}
