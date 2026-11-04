-- Vertical TALLER — 0004: marca editable, PIN temporal, notas/fotos/propuestas del mecánico y alta de talleres por el operador.
-- Requiere 0001-0003 aplicados. IDEMPOTENTE: se puede repetir.
-- ⛔ NO APLICADA. Se aplica a mano como `postgres` (preview → prod tras OK de Alberto).
--
--  1) Marca editable por el dueño: columnas en `configuracion` (NO en `talleres.marca_codigo`, que el rol no puede escribir).
--     NULL = «usa los valores por defecto de la marca del taller» (@central/brand), nunca un color inventado.
--  2) `usuarios_taller.debe_cambiar_pin`: el PIN temporal (alta o reset) obliga a elegir uno propio en el primer acceso.
--  3) Notas, fotos y propuestas de ampliación del mecánico en su OT (pendientes de enviar hasta que recepción/dueño las mande).
--  4) `taller.alta_taller()`: SECURITY DEFINER, para el endpoint de operador POST /api/operador/talleres. El rol de la app
--     NO tiene INSERT en `talleres` (0002); esta función es la ÚNICA vía, y solo inserta la fila del taller (idempotente por NIF).
--     Requiere que la función pertenezca a un rol que salte RLS (en Supabase, `postgres`: tiene BYPASSRLS).
BEGIN;

-- ─── 1. Marca ────────────────────────────────────────────────────────────────
ALTER TABLE taller.configuracion
  ADD COLUMN IF NOT EXISTS marca_logo_ruta text,
  ADD COLUMN IF NOT EXISTS marca_color_primario text,
  ADD COLUMN IF NOT EXISTS marca_color_secundario text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_configuracion_marca_colores') THEN
    ALTER TABLE taller.configuracion ADD CONSTRAINT ck_configuracion_marca_colores CHECK (
      (marca_color_primario IS NULL OR marca_color_primario ~ '^#[0-9a-f]{6}$')
      AND (marca_color_secundario IS NULL OR marca_color_secundario ~ '^#[0-9a-f]{6}$'));
  END IF;
END $$;

-- Sesión PIN: duración y cierre por inactividad, EDITABLES por el dueño (≡ SEGURIDAD_LOGIN_ALTA de @central/module-taller).
ALTER TABLE taller.configuracion
  ADD COLUMN IF NOT EXISTS login_sesion_minutos integer NOT NULL DEFAULT 300 CHECK (login_sesion_minutos > 0),
  ADD COLUMN IF NOT EXISTS login_inactividad_minutos integer NOT NULL DEFAULT 30 CHECK (login_inactividad_minutos > 0);

-- ─── 2. PIN temporal ─────────────────────────────────────────────────────────
ALTER TABLE taller.usuarios_taller ADD COLUMN IF NOT EXISTS debe_cambiar_pin boolean NOT NULL DEFAULT false;

-- ─── 3. Mecánico: notas, fotos, propuestas ───────────────────────────────────
CREATE TABLE IF NOT EXISTS taller.ot_notas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL,
  ot_id          uuid NOT NULL,
  autor_id       uuid NOT NULL,
  texto          text NOT NULL CHECK (length(btrim(texto)) > 0),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, autor_id) REFERENCES taller.usuarios_taller(taller_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ot_notas_ot ON taller.ot_notas (taller_id, ot_id, creado_en DESC);

-- Propuesta de ampliación: lo que el mecánico detecta. SIN precios (no los ve). Queda `pendiente_envio` hasta que
-- recepción/dueño le pone precio y la manda al cliente (se convierte en un presupuesto origen 'ampliacion').
CREATE TABLE IF NOT EXISTS taller.ot_propuestas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL,
  ot_id          uuid NOT NULL,
  autor_id       uuid NOT NULL,
  explicacion    text NOT NULL DEFAULT '',
  estado         text NOT NULL DEFAULT 'pendiente_envio' CHECK (estado IN ('pendiente_envio','enviada','descartada')),
  presupuesto_id uuid,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (taller_id, id),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, autor_id) REFERENCES taller.usuarios_taller(taller_id, id),
  FOREIGN KEY (taller_id, presupuesto_id) REFERENCES taller.presupuestos(taller_id, id),
  CHECK (estado <> 'enviada' OR presupuesto_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_ot_propuestas_ot ON taller.ot_propuestas (taller_id, ot_id, estado);

CREATE TABLE IF NOT EXISTS taller.ot_propuesta_lineas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL,
  propuesta_id   uuid NOT NULL,
  orden          integer NOT NULL,
  descripcion    text NOT NULL CHECK (length(btrim(descripcion)) > 0),
  referencia     text,
  cantidad       integer NOT NULL CHECK (cantidad > 0),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, propuesta_id) REFERENCES taller.ot_propuestas(taller_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS taller.ot_fotos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taller_id      uuid NOT NULL,
  ot_id          uuid NOT NULL,
  propuesta_id   uuid,
  autor_id       uuid NOT NULL,
  ruta           text NOT NULL,
  huella_sha256  text NOT NULL,
  nota           text,
  capturada_en   timestamptz NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (taller_id, ot_id) REFERENCES taller.ordenes_trabajo(taller_id, id),
  FOREIGN KEY (taller_id, propuesta_id) REFERENCES taller.ot_propuestas(taller_id, id),
  FOREIGN KEY (taller_id, autor_id) REFERENCES taller.usuarios_taller(taller_id, id)
);
CREATE INDEX IF NOT EXISTS idx_ot_fotos_ot ON taller.ot_fotos (taller_id, ot_id);

-- actualizado_en, RLS forzado y política por taller (mismo patrón que 0001) para las tablas nuevas.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ot_notas','ot_propuestas','ot_propuesta_lineas','ot_fotos'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || t || '_actualizado_en') THEN
      EXECUTE format('CREATE TRIGGER trg_%s_actualizado_en BEFORE UPDATE ON taller.%I
                      FOR EACH ROW EXECUTE FUNCTION taller.tocar_actualizado_en()', t, t);
    END IF;
    EXECUTE format('ALTER TABLE taller.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE taller.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'taller' AND tablename = t) THEN
      EXECUTE format('CREATE POLICY %I ON taller.%I USING (taller_id = taller.taller_actual()) WITH CHECK (taller_id = taller.taller_actual())',
                     t || '_por_taller', t);
    END IF;
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON taller.ot_notas, taller.ot_propuestas, taller.ot_propuesta_lineas, taller.ot_fotos TO prisma_taller;

-- ─── 4. Alta de talleres por el operador ─────────────────────────────────────
-- Un NIF no puede estar en dos talleres.
CREATE UNIQUE INDEX IF NOT EXISTS ux_talleres_nif ON taller.talleres (nif) WHERE nif IS NOT NULL;

CREATE OR REPLACE FUNCTION taller.alta_taller(p_razon_social text, p_nombre_comercial text, p_nif text)
RETURNS TABLE (o_id uuid, o_creado boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = taller, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF btrim(coalesce(p_razon_social, '')) = '' OR btrim(coalesce(p_nombre_comercial, '')) = '' THEN
    RAISE EXCEPTION 'faltan la razón social o el nombre comercial';
  END IF;
  IF p_nif IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('alta_taller:' || p_nif));
    SELECT t.id INTO v_id FROM taller.talleres t WHERE t.nif = p_nif;
    IF FOUND THEN
      RETURN QUERY SELECT v_id, false;
      RETURN;
    END IF;
  END IF;
  INSERT INTO taller.talleres (razon_social, nombre_comercial, nif)
    VALUES (btrim(p_razon_social), btrim(p_nombre_comercial), p_nif) RETURNING talleres.id INTO v_id;
  RETURN QUERY SELECT v_id, true;
END $$;
REVOKE ALL ON FUNCTION taller.alta_taller(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION taller.alta_taller(text, text, text) TO prisma_taller;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'taller' AND c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity);   → 0 filas
-- SELECT has_function_privilege('prisma_taller', 'taller.alta_taller(text,text,text)', 'EXECUTE');       → true
-- SELECT has_table_privilege('prisma_taller', 'taller.talleres', 'INSERT');                              → false (sigue)
