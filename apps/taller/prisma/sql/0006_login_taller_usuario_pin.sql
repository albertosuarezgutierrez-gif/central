-- Vertical TALLER — 0006: login taller → usuario → PIN, versión de sesión y vínculo RR.HH. solo del operador.
-- Requiere 0001-0005 aplicados. IDEMPOTENTE. ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (preview → prod tras OK de Alberto).
--
--  1) `talleres.codigo_acceso`: código corto (8 caracteres A-Z/0-9) que el dispositivo recuerda; sustituye al TALLER_PILOTO_ID para
--     resolver el taller en el login. Único. Lo genera el alta y el dueño lo edita/regenera en Ajustes. Resolver código → taller
--     ANTES de tener taller (sin RLS) solo es posible por `taller.taller_por_codigo()` (SECURITY DEFINER, devuelve solo el id).
--  2) El PIN deja de ser único en el taller (se elige usuario antes). NO hay índice/único sobre `pin_hash` (la unicidad la hacía la
--     app); se deja un DROP INDEX defensivo por si alguien lo creó a mano.
--  3) Bloqueo por USUARIO (5 fallos → 5 h de alta, editable): columnas en `configuracion`. El contador vive en `bloqueos_pin`.
--  4) `usuarios_taller.sesion_version`: va en la sesión firmada; cambiar/resetear PIN o dar de baja la incrementa y la cookie vieja
--     deja de valer.
--  5) `talleres.rrhh_empresa_id` ya NO lo escribe el rol de la app (lo podía cambiar el dueño y fichar contra OTRA empresa de rrhh):
--     solo el operador, por `taller.fijar_rrhh_empresa()` (SECURITY DEFINER) desde POST/PATCH /api/operador/talleres.
BEGIN;

-- ─── 1. Código de acceso ─────────────────────────────────────────────────────
ALTER TABLE taller.talleres ADD COLUMN IF NOT EXISTS codigo_acceso text;
-- Talleres que ya existen (piloto G2): se les da uno. El dueño lo ve y lo regenera en Ajustes → Código del taller.
UPDATE taller.talleres SET codigo_acceso = upper(substr(md5(random()::text || id::text), 1, 8)) WHERE codigo_acceso IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_talleres_codigo_acceso') THEN
    ALTER TABLE taller.talleres ADD CONSTRAINT ck_talleres_codigo_acceso CHECK (codigo_acceso IS NULL OR codigo_acceso ~ '^[A-Z0-9]{6,12}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_talleres_codigo_acceso ON taller.talleres (codigo_acceso) WHERE codigo_acceso IS NOT NULL;
-- El rol de la app asigna/regenera el código (alta del operador y Ajustes del dueño).
GRANT UPDATE (codigo_acceso) ON taller.talleres TO prisma_taller;

CREATE OR REPLACE FUNCTION taller.taller_por_codigo(p_codigo text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = taller, pg_temp
AS $$ SELECT t.id FROM taller.talleres t WHERE t.codigo_acceso = upper(btrim(p_codigo)) AND t.activo LIMIT 1 $$;
REVOKE ALL ON FUNCTION taller.taller_por_codigo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION taller.taller_por_codigo(text) TO prisma_taller;

-- ─── 2. PIN no único ─────────────────────────────────────────────────────────
DROP INDEX IF EXISTS taller.ux_usuarios_taller_pin;
DROP INDEX IF EXISTS taller.ux_usuarios_taller_pin_hash;

-- ─── 3. Bloqueo por usuario (≡ SEGURIDAD_LOGIN_ALTA de @central/module-taller) ───────────────────────────────────
ALTER TABLE taller.configuracion
  ADD COLUMN IF NOT EXISTS login_max_fallos_usuario integer NOT NULL DEFAULT 5 CHECK (login_max_fallos_usuario > 0),
  ADD COLUMN IF NOT EXISTS login_bloqueo_usuario_minutos integer NOT NULL DEFAULT 300 CHECK (login_bloqueo_usuario_minutos > 0);

-- ─── 4. Versión de sesión ────────────────────────────────────────────────────
ALTER TABLE taller.usuarios_taller ADD COLUMN IF NOT EXISTS sesion_version integer NOT NULL DEFAULT 0 CHECK (sesion_version >= 0);

-- ─── 5. Vínculo con RR.HH. solo del operador ─────────────────────────────────
REVOKE UPDATE (rrhh_empresa_id) ON taller.talleres FROM prisma_taller;

CREATE OR REPLACE FUNCTION taller.fijar_rrhh_empresa(p_taller uuid, p_empresa uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = taller, pg_temp
AS $$
BEGIN
  UPDATE taller.talleres SET rrhh_empresa_id = p_empresa, actualizado_en = now() WHERE id = p_taller;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION taller.fijar_rrhh_empresa(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION taller.fijar_rrhh_empresa(uuid, uuid) TO prisma_taller;

-- ─── 6. Límite de intentos del CÓDIGO del taller por IP (aún no hay taller resuelto: sin taller_id ni RLS; solo IP y contadores) ───
CREATE TABLE IF NOT EXISTS taller.bloqueos_codigo (
  clave           text PRIMARY KEY,           -- 'codigo:<ip>'
  intentos        integer NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  bloqueado_hasta timestamptz,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON taller.bloqueos_codigo TO prisma_taller;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT count(*) FROM taller.talleres WHERE codigo_acceso IS NULL;                                       → 0 (talleres con alta por 0004 sin código: lo pone el alta)
-- SELECT has_column_privilege('prisma_taller', 'taller.talleres', 'rrhh_empresa_id', 'UPDATE');            → false
-- SELECT has_function_privilege('prisma_taller', 'taller.taller_por_codigo(text)', 'EXECUTE');             → true
