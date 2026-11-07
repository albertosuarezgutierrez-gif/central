-- CONTABILIDAD F6 — portal de la gestoría (revisiones, comentarios, asignación de gestor) y terceros (onboarding).
-- Spec: docs/superpowers/specs/2026-11-04-modulo-contabilidad.md F6. Requiere 0001 y 0003 (facturas_recibidas). 0002/0004 solo para los contadores del portal.
--
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` (preview → producción tras OK de Alberto). ADITIVA: solo CREA tablas/funciones/índices y GRANTs.
--    NO es idempotente en las tablas (CREATE TABLE sin IF NOT EXISTS): se aplica UNA vez. Mientras no esté aplicada, /gestoria y /onboarding lo dicen
--    en pantalla en vez de romper (cada acceso va en su propia transacción y a prueba de fallos).
--
-- Diseño:
--   · TABLA DE ASIGNACIÓN del gestor = `usuario_empresas` (0001: vínculo usuario↔empresa con rol 'gestor', activo/revocado). No se duplica: un gestor ve SOLO
--     las empresas con vínculo ACTIVO de rol gestor. Se añade `empresas_de_gestor()` (SECURITY DEFINER, solo ese rol) y un índice parcial.
--   · `revisiones`: «esto lo ha revisado X». Los asientos y las facturas son INMUTABLES, así que la revisión es una fila APARTE, solo-añadir, única por objeto.
--     FK compuestas (empresa_id, objeto_id): una revisión no puede apuntar a un objeto de OTRA empresa.
--   · `comentarios`: hilo por asiento / factura recibida / referencia de documento (exactamente uno). Solo-añadir (no se edita ni se borra).
--   · Autoría: el trigger exige que el autor tenga vínculo ACTIVO con ESA empresa y con el rol que declara (un gestor revocado no puede comentar ni revisar).
--   · `terceros`: clientes/proveedores/acreedores importados (NIF validado en la app; aquí, forma). Único por (empresa, NIF, tipo). Editables solo nombre/email/teléfono/activo.
--   · RLS ENABLE + FORCE por empresa (`empresa_actual()`), permisos mínimos para `prisma_contabilidad`, SIN DELETE ni TRUNCATE en ninguna tabla nueva.

BEGIN;

-- ─── 1. Asignación de gestores ──────────────────────────────────────────────────────────────────────────────────────────
CREATE INDEX idx_usuario_empresas_gestor ON contabilidad.usuario_empresas (usuario_id) WHERE activo AND rol = 'gestor';

-- Empresas ACTIVAS que el usuario ACTIVO gestiona (vínculo activo de rol gestor). Sin empresa fijada (es el selector del portal).
CREATE OR REPLACE FUNCTION contabilidad.empresas_de_gestor(p_usuario uuid)
RETURNS TABLE (o_empresa uuid, o_razon_social text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = contabilidad, pg_temp
AS $$
  SELECT e.id, e.razon_social
    FROM contabilidad.usuario_empresas ue
    JOIN contabilidad.empresas e ON e.id = ue.empresa_id
    JOIN contabilidad.usuarios u ON u.id = ue.usuario_id
   WHERE ue.usuario_id = p_usuario AND ue.rol = 'gestor' AND ue.activo AND e.activo AND u.activo
   ORDER BY e.razon_social
$$;
REVOKE ALL ON FUNCTION contabilidad.empresas_de_gestor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contabilidad.empresas_de_gestor(uuid) TO prisma_contabilidad;

-- El autor de una revisión/comentario tiene vínculo ACTIVO con la empresa y con el rol que declara.
CREATE OR REPLACE FUNCTION contabilidad.autor_vinculado() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM contabilidad.usuario_empresas ue
                  WHERE ue.usuario_id = NEW.usuario_id AND ue.empresa_id = NEW.empresa_id AND ue.activo AND ue.rol = NEW.rol) THEN
    RAISE EXCEPTION 'el usuario % no tiene acceso activo como % a la empresa %', NEW.usuario_id, NEW.rol, NEW.empresa_id;
  END IF;
  RETURN NEW;
END $$;

-- ─── 2. Revisiones (asientos y facturas recibidas) ─────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.revisiones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES contabilidad.empresas(id),
  asiento_id            uuid,
  factura_recibida_id   uuid,
  usuario_id            uuid NOT NULL REFERENCES contabilidad.usuarios(id),
  rol                   text NOT NULL CHECK (rol IN ('dueno', 'gestor')),
  revisado_en           timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(asiento_id, factura_recibida_id) = 1),
  FOREIGN KEY (empresa_id, asiento_id) REFERENCES contabilidad.asientos (empresa_id, id),
  FOREIGN KEY (empresa_id, factura_recibida_id) REFERENCES contabilidad.facturas_recibidas (empresa_id, id)
);
-- Una sola revisión por objeto (repetir «revisado» no duplica).
CREATE UNIQUE INDEX uq_revisiones_asiento ON contabilidad.revisiones (empresa_id, asiento_id) WHERE asiento_id IS NOT NULL;
CREATE UNIQUE INDEX uq_revisiones_factura ON contabilidad.revisiones (empresa_id, factura_recibida_id) WHERE factura_recibida_id IS NOT NULL;
CREATE TRIGGER trg_revisiones_autor BEFORE INSERT ON contabilidad.revisiones
  FOR EACH ROW EXECUTE FUNCTION contabilidad.autor_vinculado();

-- ─── 3. Comentarios por asiento / documento ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE contabilidad.comentarios (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid NOT NULL REFERENCES contabilidad.empresas(id),
  asiento_id            uuid,
  factura_recibida_id   uuid,
  documento_ref         text CHECK (documento_ref IS NULL OR (btrim(documento_ref) <> '' AND length(documento_ref) <= 300)),
  usuario_id            uuid NOT NULL REFERENCES contabilidad.usuarios(id),
  rol                   text NOT NULL CHECK (rol IN ('dueno', 'gestor')),
  texto                 text NOT NULL CHECK (btrim(texto) <> '' AND length(texto) <= 2000),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(asiento_id, factura_recibida_id, documento_ref) = 1),
  FOREIGN KEY (empresa_id, asiento_id) REFERENCES contabilidad.asientos (empresa_id, id),
  FOREIGN KEY (empresa_id, factura_recibida_id) REFERENCES contabilidad.facturas_recibidas (empresa_id, id)
);
CREATE INDEX idx_comentarios_asiento ON contabilidad.comentarios (empresa_id, asiento_id, creado_en) WHERE asiento_id IS NOT NULL;
CREATE INDEX idx_comentarios_factura ON contabilidad.comentarios (empresa_id, factura_recibida_id, creado_en) WHERE factura_recibida_id IS NOT NULL;
CREATE INDEX idx_comentarios_documento ON contabilidad.comentarios (empresa_id, documento_ref, creado_en) WHERE documento_ref IS NOT NULL;
CREATE INDEX idx_comentarios_recientes ON contabilidad.comentarios (empresa_id, creado_en DESC);
CREATE TRIGGER trg_comentarios_autor BEFORE INSERT ON contabilidad.comentarios
  FOR EACH ROW EXECUTE FUNCTION contabilidad.autor_vinculado();

-- Revisiones y comentarios son solo-añadir (el trigger lo impide también a quien tenga más privilegios).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['revisiones', 'comentarios'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_inmutable BEFORE UPDATE OR DELETE ON contabilidad.%I
                    FOR EACH ROW EXECUTE FUNCTION contabilidad.prohibir_cambios()', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_sin_truncate BEFORE TRUNCATE ON contabilidad.%I
                    FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios()', t, t);
  END LOOP;
END $$;

-- ─── 4. Terceros (onboarding: importación CSV con NIF validado en la app) ───────────────────────────────────────────────
CREATE TABLE contabilidad.terceros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL REFERENCES contabilidad.empresas(id),
  nif             text NOT NULL CHECK (nif ~ '^[A-Z0-9]{8,12}$'),
  nombre          text NOT NULL CHECK (btrim(nombre) <> '' AND length(nombre) <= 200),
  tipo            text NOT NULL CHECK (tipo IN ('cliente', 'proveedor', 'acreedor')),
  email           text CHECK (email IS NULL OR (length(email) <= 200 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  telefono        text CHECK (telefono IS NULL OR length(telefono) <= 40),
  activo          boolean NOT NULL DEFAULT true,
  origen          text NOT NULL DEFAULT 'importacion' CHECK (origen IN ('importacion', 'manual')),
  creado_por      uuid,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nif, tipo)
);
CREATE INDEX idx_terceros_nombre ON contabilidad.terceros (empresa_id, tipo, nombre);
CREATE TRIGGER trg_terceros_actualizado_en BEFORE UPDATE ON contabilidad.terceros
  FOR EACH ROW EXECUTE FUNCTION contabilidad.tocar_actualizado_en();
CREATE TRIGGER trg_terceros_sin_truncate BEFORE TRUNCATE ON contabilidad.terceros
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad.prohibir_cambios();

-- ─── 5. RLS ENABLE + FORCE por empresa ──────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['revisiones', 'comentarios', 'terceros'] LOOP
    EXECUTE format('ALTER TABLE contabilidad.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE contabilidad.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON contabilidad.%I USING (empresa_id = contabilidad.empresa_actual()) WITH CHECK (empresa_id = contabilidad.empresa_actual())',
                   t || '_por_empresa', t);
  END LOOP;
END $$;

-- ─── 6. Permisos MÍNIMOS del rol (nunca DELETE ni TRUNCATE ni ALL) ──────────────────────────────────────────────────────
GRANT SELECT, INSERT ON contabilidad.revisiones TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.comentarios TO prisma_contabilidad;
GRANT SELECT, INSERT ON contabilidad.terceros TO prisma_contabilidad;
GRANT UPDATE (nombre, email, telefono, activo, actualizado_en) ON contabilidad.terceros TO prisma_contabilidad;
REVOKE DELETE, TRUNCATE ON contabilidad.revisiones, contabilidad.comentarios, contabilidad.terceros FROM prisma_contabilidad;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────────────────────────────────────────────
-- SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid IN ('contabilidad.revisiones'::regclass, 'contabilidad.comentarios'::regclass, 'contabilidad.terceros'::regclass);  → todo t, t
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.comentarios', 'UPDATE');                                      → false
-- SELECT has_table_privilege('prisma_contabilidad', 'contabilidad.revisiones', 'DELETE');                                       → false
-- SELECT has_column_privilege('prisma_contabilidad', 'contabilidad.terceros', 'nif', 'UPDATE');                                 → false
-- Aislamiento del gestor (dos empresas A y B, el gestor solo asignado a A), en una transacción que se deshace:
--   BEGIN; SELECT * FROM contabilidad.empresas_de_gestor('<gestor>');                                                           → solo A
--   SET LOCAL ROLE prisma_contabilidad; SELECT set_config('contabilidad.empresa_id', '<A>', true);
--   SELECT count(*) FROM contabilidad.comentarios WHERE empresa_id = '<B>';                                                     → 0
--   INSERT INTO contabilidad.comentarios (empresa_id, asiento_id, usuario_id, rol, texto) VALUES ('<B>', …);                    → error de RLS
--   ROLLBACK;
