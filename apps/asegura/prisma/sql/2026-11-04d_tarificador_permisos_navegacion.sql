-- 2026-11-04d — PERMISOS DE NAVEGACIÓN del tarificador RPA en BD (explorador 0.3.46). Código: packages/module-tarificacion/src/
-- permisos-navegacion.ts (validación + fusión, PURA), apps/asegura/lib/tarificador-permisos-navegacion*.ts (lectura y paso al worker),
-- services/tarificador-rpa (revalida y aplica: guard.ts `fijarPermisosNavegacion`).
--
-- Qué es: AMPLIACIONES ESTRECHAS de navegación por ENTRADA cerrada del explorador (`ENTRADAS_EXPLORACION`), para pilotar/explorar una
-- compañía sin reconstruir la imagen del worker. Solo AÑADEN; dos tipos con esquema CERRADO (el validador de código es la verdad: una fila
-- que no pase se IGNORA y se registra en el log del worker/asegura con su código, nunca abre más):
--   · 'ruta_tolerada' {origen, ruta, pulsable}: origen https EXACTO de un dominio de la compañía (`DOMINIOS_PORTAL_COMPANIA`), ruta EXACTA
--     sin comodines/query/codificación y sin verbos de acción final en NINGÚN segmento (tampoco padres «emision»/«contratacion»: eso es
--     solo de código), y su URL no puede casar el patrón de emisión: lo único que relaja es que, en una navegación GET (documento/marco)
--     a ESA ruta, el texto de la query (p. ej. un `redirect_uri`) no cuente; los nombres de parámetro de acción se siguen mirando.
--     `pulsable: true` = también en el href de un control que lleve a ella. Nunca en POST ni cuerpos.
--   · 'avance_texto' {texto, origen, rutaMarco, tag, contenedor?, maxUsos}: un avance por texto EXACTO de una LISTA BLANCA cerrada
--     (aceptar, siguiente, continuar, cerrar, entendido, volver, cancelar; cualquier otro se ignora), en el marco de ese
--     origen + ruta EXACTOS, tag button|a|input, dentro de `contenedor` (selector simple) si se da, ≤ maxUsos (1-3) por trabajo. Solo lo
--     pulsa la puerta del explorador (`pulsarExploracionAutorizada`), que lo repite VIVO (único, sin precio, sin títulos de emisión…).
-- 🚨 TARIFICAR ≠ EMITIR. Los bloqueos DUROS siguen en código y la BD no los toca: verbos de acción final (emitir, contratar, pagar,
--    firmar, confirmar, tarificar…: un texto así se ignora al cargar), URL/parámetros/cuerpos de emisión fuera de la ruta exacta, el tope
--    del wizard de Pelayo (la BD no añade pasos pulsables), campos de cuenta/tarjeta y credenciales.
-- 🚨 Fail-closed: sin esta tabla (o con la BD caída) asegura no manda permisos y el worker hace lo de siempre (solo código).
--
-- Sin correduria_id A PROPÓSITO: describe la NAVEGACIÓN de un portal de compañía (como `ENTRADAS_EXPLORACION` en código), igual para
-- todas las corredurías; no hay datos de clientes ni de nadie. Sin PII: orígenes, rutas y rótulos de botones.
--
-- Auditoría APPEND-ONLY: `tarificador_permisos_navegacion_auditoria` recibe por trigger cada alta y cada cambio de estado (fila entera).
-- Nadie borra: DELETE prohibido por trigger de fila y TRUNCATE por trigger de sentencia en las dos tablas (desactivar = `activo = false`); en la de permisos solo cambian `activo`,
-- `desactivado_por` y `desactivado_at` (otro permiso = otra fila). La app (prisma_seguros) SOLO LEE la tabla de permisos; las altas las
-- hace el operador por SQL (plantilla al final).
-- Fuera de estas barreras POR DISEÑO: `postgres` (dueño, puede DROP/ALTER ... DISABLE TRIGGER) y `service_role` (BYPASSRLS, sin GRANT
-- aquí). Son los roles del operador; la auditoría protege contra la app y contra errores, no contra el dueño de la BD.
--
-- ⚠️ NO APLICADA. En transacción. Se deshace con el bloque ROLLBACK del final.

BEGIN;

SET search_path = seguros, public;

CREATE TABLE IF NOT EXISTS seguros.tarificador_permisos_navegacion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada         text NOT NULL CHECK (entrada ~ '^[a-z0-9_]{1,40}:[a-z0-9_]{1,40}:[a-z0-9_]{1,40}$'),
  tipo            text NOT NULL CHECK (tipo IN ('ruta_tolerada', 'avance_texto')),
  -- Esquema CERRADO por tipo (primera barrera; la validación completa es la del código, que se repite en asegura y en el worker).
  datos           jsonb NOT NULL CHECK (jsonb_typeof(datos) = 'object' AND pg_column_size(datos) <= 2000),
  activo          boolean NOT NULL DEFAULT true,
  motivo          text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 10 AND 500),
  creado_por      text NOT NULL CHECK (length(btrim(creado_por)) BETWEEN 2 AND 120),
  created_at      timestamptz NOT NULL DEFAULT now(),
  desactivado_por text CHECK (desactivado_por IS NULL OR length(btrim(desactivado_por)) BETWEEN 2 AND 120),
  desactivado_at  timestamptz,
  CONSTRAINT permiso_nav_desactivado_coherente CHECK ((activo AND desactivado_at IS NULL AND desactivado_por IS NULL) OR (NOT activo AND desactivado_at IS NOT NULL AND desactivado_por IS NOT NULL)),
  CONSTRAINT permiso_nav_ruta_forma CHECK (tipo <> 'ruta_tolerada' OR (
    datos ?& ARRAY['origen', 'ruta', 'pulsable'] AND (datos - ARRAY['origen', 'ruta', 'pulsable']) = '{}'::jsonb
    AND jsonb_typeof(datos->'pulsable') = 'boolean'
    AND (datos->>'origen') ~ '^https://[a-z0-9.-]{3,110}$'
    AND (datos->>'ruta') ~ '^/[A-Za-z0-9._~/-]{0,199}$' AND (datos->>'ruta') !~ '\.\.')),
  CONSTRAINT permiso_nav_avance_forma CHECK (tipo <> 'avance_texto' OR (
    (datos - ARRAY['texto', 'origen', 'rutaMarco', 'tag', 'contenedor', 'maxUsos']) = '{}'::jsonb
    AND datos ?& ARRAY['texto', 'origen', 'rutaMarco', 'tag', 'maxUsos']
    AND jsonb_typeof(datos->'maxUsos') = 'number' AND (datos->>'maxUsos') IN ('1', '2', '3')
    AND (datos->>'tag') IN ('button', 'a', 'input')
    AND length(datos->>'texto') BETWEEN 1 AND 60
    AND (datos->>'origen') ~ '^https://[a-z0-9.-]{3,110}$'
    AND (datos->>'rutaMarco') ~ '^/[A-Za-z0-9._~/-]{0,199}$' AND (datos->>'rutaMarco') !~ '\.\.'))
);

-- Lectura de asegura: por entrada, solo activas.
CREATE INDEX IF NOT EXISTS idx_permisos_nav_entrada_activos ON seguros.tarificador_permisos_navegacion (entrada, created_at) WHERE activo;

COMMENT ON TABLE seguros.tarificador_permisos_navegacion IS
  'Tarificador RPA: ampliaciones ESTRECHAS de navegación por entrada (ruta exacta GET / avance por texto exacto). Las valida el código '
  '(permisos-navegacion.ts) en asegura y en el worker; una fila inválida se ignora. Los bloqueos duros de emisión siguen en código. Sin PII.';

CREATE TABLE IF NOT EXISTS seguros.tarificador_permisos_navegacion_auditoria (
  n          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  permiso_id uuid NOT NULL,
  accion     text NOT NULL CHECK (accion IN ('alta', 'cambio')),
  fila       jsonb NOT NULL,
  rol        text NOT NULL DEFAULT current_user,
  at         timestamptz NOT NULL DEFAULT now()
);

-- Triggers: inmutabilidad (solo se desactiva/reactiva), sin DELETE y auditoría de todo.
CREATE OR REPLACE FUNCTION seguros.permisos_nav_guardia() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tarificador_permisos_navegacion: no se borra (desactiva con activo = false)';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.entrada, NEW.tipo, NEW.datos, NEW.motivo, NEW.creado_por, NEW.created_at)
                       IS DISTINCT FROM (OLD.id, OLD.entrada, OLD.tipo, OLD.datos, OLD.motivo, OLD.creado_por, OLD.created_at) THEN
    RAISE EXCEPTION 'tarificador_permisos_navegacion: solo cambian activo/desactivado_*; otro permiso = otra fila';
  END IF;
  INSERT INTO seguros.tarificador_permisos_navegacion_auditoria (permiso_id, accion, fila)
  VALUES (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'alta' ELSE 'cambio' END, to_jsonb(NEW));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_permisos_nav_guardia ON seguros.tarificador_permisos_navegacion;
CREATE TRIGGER trg_permisos_nav_guardia BEFORE INSERT OR UPDATE OR DELETE ON seguros.tarificador_permisos_navegacion
  FOR EACH ROW EXECUTE FUNCTION seguros.permisos_nav_guardia();

CREATE OR REPLACE FUNCTION seguros.permisos_nav_auditoria_solo_alta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tarificador_permisos_navegacion_auditoria: append-only';
END $$;

DROP TRIGGER IF EXISTS trg_permisos_nav_auditoria_solo_alta ON seguros.tarificador_permisos_navegacion_auditoria;
CREATE TRIGGER trg_permisos_nav_auditoria_solo_alta BEFORE UPDATE OR DELETE ON seguros.tarificador_permisos_navegacion_auditoria
  FOR EACH ROW EXECUTE FUNCTION seguros.permisos_nav_auditoria_solo_alta();

-- TRUNCATE no dispara los triggers de fila: trigger de SENTENCIA en las dos tablas (vacía la tabla sin pasar por la auditoría).
CREATE OR REPLACE FUNCTION seguros.permisos_nav_sin_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%: TRUNCATE prohibido (desactiva con activo = false)', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS trg_permisos_nav_sin_truncate ON seguros.tarificador_permisos_navegacion;
CREATE TRIGGER trg_permisos_nav_sin_truncate BEFORE TRUNCATE ON seguros.tarificador_permisos_navegacion
  FOR EACH STATEMENT EXECUTE FUNCTION seguros.permisos_nav_sin_truncate();
DROP TRIGGER IF EXISTS trg_permisos_nav_auditoria_sin_truncate ON seguros.tarificador_permisos_navegacion_auditoria;
CREATE TRIGGER trg_permisos_nav_auditoria_sin_truncate BEFORE TRUNCATE ON seguros.tarificador_permisos_navegacion_auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION seguros.permisos_nav_sin_truncate();

-- Permisos (mismo patrón que tarificador_pilotaje_*): RLS sin policies, nada público; la app SOLO lee los permisos y no ve la auditoría.
ALTER TABLE seguros.tarificador_permisos_navegacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_permisos_navegacion_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_permisos_navegacion, seguros.tarificador_permisos_navegacion_auditoria FROM PUBLIC, anon, authenticated, crm_seguros;
REVOKE ALL ON seguros.tarificador_permisos_navegacion, seguros.tarificador_permisos_navegacion_auditoria FROM prisma_seguros;
GRANT SELECT ON seguros.tarificador_permisos_navegacion TO prisma_seguros;
-- Redundante con el REVOKE ALL (queda explícito y lo vigila un test): la app nunca vacía estas tablas.
REVOKE TRUNCATE ON seguros.tarificador_permisos_navegacion, seguros.tarificador_permisos_navegacion_auditoria FROM prisma_seguros;
REVOKE ALL ON FUNCTION seguros.permisos_nav_guardia(), seguros.permisos_nav_auditoria_solo_alta(), seguros.permisos_nav_sin_truncate() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ─── Comprobación tras aplicar ───────────────────────────────────────────────
--   select relrowsecurity from pg_class where oid in ('seguros.tarificador_permisos_navegacion'::regclass,
--     'seguros.tarificador_permisos_navegacion_auditoria'::regclass);                                              -- t, t
--   select has_table_privilege('prisma_seguros', 'seguros.tarificador_permisos_navegacion', 'select');           -- t
--   select has_table_privilege('prisma_seguros', 'seguros.tarificador_permisos_navegacion', 'insert');           -- f
--   select has_table_privilege('prisma_seguros', 'seguros.tarificador_permisos_navegacion', 'delete');           -- f
--   select has_table_privilege('prisma_seguros', 'seguros.tarificador_permisos_navegacion', 'truncate');         -- f
--   select has_table_privilege('prisma_seguros', 'seguros.tarificador_permisos_navegacion_auditoria', 'select'); -- f
--   select has_table_privilege('anon', 'seguros.tarificador_permisos_navegacion', 'select');                     -- f
--   select tgname from pg_trigger where tgrelid in ('seguros.tarificador_permisos_navegacion'::regclass,
--     'seguros.tarificador_permisos_navegacion_auditoria'::regclass) and not tgisinternal;                         -- 4 triggers
--
-- ─── ROLLBACK (con ninguna fila que conservar; la auditoría se pierde: expórtala antes si hace falta) ────────
--   BEGIN;
--   DROP TABLE IF EXISTS seguros.tarificador_permisos_navegacion;
--   DROP TABLE IF EXISTS seguros.tarificador_permisos_navegacion_auditoria;
--   DROP FUNCTION IF EXISTS seguros.permisos_nav_guardia();
--   DROP FUNCTION IF EXISTS seguros.permisos_nav_auditoria_solo_alta();
--   DROP FUNCTION IF EXISTS seguros.permisos_nav_sin_truncate();
--   COMMIT;
--   (El código sigue funcionando sin la tabla: asegura lee 0 permisos y el worker hace lo de siempre.)
--
-- ─── PLANTILLA DEL OPERADOR: añadir un permiso (como postgres / MCP Supabase, proyecto central) ──────────────────
--   La `entrada` tiene que existir en `ENTRADAS_EXPLORACION` y el origen ser de un dominio de su compañía; si no, el código la ignora.
--   Comprueba primero qué dirá el validador: `cd packages/module-tarificacion && npx vitest run src/permisos-navegacion.test.ts` cubre los
--   casos; ante la duda, mira el log del worker `permisos_navegacion` (ids y códigos de las filas ignoradas) tras el siguiente trabajo.
--
--   -- (a) Ruta exacta tolerada en navegación GET (p. ej. un SSO nuevo que redirige solo; pulsable=false = solo la red):
--   INSERT INTO seguros.tarificador_permisos_navegacion (entrada, tipo, datos, motivo, creado_por)
--   VALUES ('pelayo:presupuestos:auto', 'ruta_tolerada',
--           '{"origen": "https://acceso12.pelayo.com", "ruta": "/oauth2/rest/authorize", "pulsable": false}',
--           'SSO de Pelayo visto en el pilotaje del 04/11/2026 (redirección GET tras el login)', 'alberto');
--
--   -- (b) Avance «Aceptar» por texto exacto en UNA pantalla (origen + ruta del marco exactos), como mucho 2 veces por trabajo:
--   INSERT INTO seguros.tarificador_permisos_navegacion (entrada, tipo, datos, motivo, creado_por)
--   VALUES ('pelayo:presupuestos:auto', 'avance_texto',
--           '{"texto": "Aceptar", "origen": "https://mediadores.pelayo.com", "rutaMarco": "/portalmediador-nuevo-presupuesto", "tag": "button", "contenedor": "pelayo-modal", "maxUsos": 2}',
--           'Aceptar del aviso informativo de la pantalla de nuevo presupuesto (no emite; visto en real)', 'alberto');
--
--   -- Desactivar (nunca DELETE; queda en la auditoría):
--   UPDATE seguros.tarificador_permisos_navegacion SET activo = false, desactivado_por = 'alberto', desactivado_at = now() WHERE id = '<uuid>';
--
--   -- Ver lo vigente y su historia:
--   SELECT id, entrada, tipo, datos, motivo, creado_por, created_at FROM seguros.tarificador_permisos_navegacion WHERE activo ORDER BY entrada, created_at;
--   SELECT permiso_id, accion, rol, at FROM seguros.tarificador_permisos_navegacion_auditoria ORDER BY n DESC LIMIT 20;
