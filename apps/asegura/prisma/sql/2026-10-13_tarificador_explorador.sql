-- 2026-10-13 — EXPLORADOR IA del tarificador RPA (fase A: esquema). Núcleo puro en
-- packages/module-tarificacion/src/explorador.ts; rutas del worker en apps/asegura/app/api/tarificador/explorador/*.
--
-- Decisiones de Alberto (13/10/2026):
--   · `modo = 'exploracion'`: el worker entra en el portal, llega a una ENTRADA cerrada y en cada pantalla asegura le
--     dice qué hacer (memoria del mapa o IA, validado por lista blanca). Sale un MAPA determinista que una persona revisa.
--   · NIF real SOLO si la exploración va ligada a una petición REAL de ese cliente/lead (un trabajo `tarificar` suyo o
--     una oportunidad suya). Sin ancla → exploración SINTÉTICA, sin cliente; si el portal pide NIF, se para.
--   · Tope 2 € por exploración (lo aplica el código); coste en `ai_usos` con cliente_ref = 'explorador:<trabajo>'.
--
-- ⚠️ NO APLICADA. Orden: el código de asegura es fail-closed sin ella (las rutas `/api/tarificador/explorador/*`
--    responden 503 `explorador_sin_esquema`; `trabajoParaWorker` no sirve un modo que no conoce). Requiere
--    2026-10-05_tarificador_rpa.sql y 2026-10-10_tarificador_emision.sql (columna `modo`).
--
-- Qué hace (una transacción; idempotente):
--   1. `tarificacion_trabajos`: `modo` admite 'exploracion'; `cliente_id` pasa a ser opcional SOLO para exploración
--      sintética (CHECK); con cliente ⇒ ancla real (trabajo origen `tarificar` del MISMO cliente u oportunidad del MISMO
--      cliente, comprobado por trigger); una exploración termina `ok` sin tarificación; una viva por compañía.
--   2. `tarificador_exploraciones`: cabecera (entrada, modelo, mapa jsonb versionado, estado de revisión, coste).
--   3. `tarificador_exploracion_pasos`: cada pantalla (huella, inventario SANEADO, respuesta validada, origen, coste).
--   4. Permisos: solo `prisma_seguros`, SIN DELETE (rastro de que un bot entró en un portal con nuestra credencial).
--
-- Sin PII: el inventario va saneado (sin valores de inputs; textos con forma de dato personal, código/nombre de
-- mediador y «último acceso» QUITADOS) por el worker y otra vez por asegura. La respuesta de la IA solo lleva CLAVES del
-- catálogo; el valor (incluido el NIF de una exploración real) lo inyecta el worker desde `riesgo` y no vuelve aquí.
--
-- Se deshace con: DROP TABLE seguros.tarificador_exploracion_pasos, seguros.tarificador_exploraciones; DROP TRIGGER/
-- FUNCTION de origen; restaurar los CHECK `tarificacion_trabajos_modo_valido` y `trabajo_ok_con_tarificacion`, y
-- `ALTER COLUMN cliente_id SET NOT NULL` (solo si no quedan exploraciones sintéticas).

BEGIN;

SET search_path = seguros, public;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. La cola admite exploraciones
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_modo_valido;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_modo_valido
  CHECK (modo IN ('tarificar', 'emision', 'exploracion'));

-- `cliente_id` sigue siendo obligatorio para tarificar y emitir; solo la exploración SINTÉTICA va sin cliente.
ALTER TABLE seguros.tarificacion_trabajos ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_cliente_salvo_exploracion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_cliente_salvo_exploracion
  CHECK (modo = 'exploracion' OR cliente_id IS NOT NULL);

-- Exploración CON cliente ⇒ con ancla real (trabajo origen u oportunidad). SIN cliente ⇒ sin anclas (sintética pura).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_exploracion_ancla;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_exploracion_ancla
  CHECK (modo <> 'exploracion'
         OR (cliente_id IS NOT NULL AND (trabajo_origen_id IS NOT NULL OR oportunidad_id IS NOT NULL))
         OR (cliente_id IS NULL AND trabajo_origen_id IS NULL AND oportunidad_id IS NULL AND poliza_id IS NULL));

-- Una exploración no emite ni cuelga de un presupuesto.
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_exploracion_sin_emision;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_exploracion_sin_emision
  CHECK (modo <> 'exploracion' OR (presupuesto_id IS NULL AND opcion_id IS NULL AND emision_prima_cents IS NULL));

-- Una exploración acaba `ok` con un MAPA, no con una tarificación.
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_ok_con_tarificacion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_ok_con_tarificacion
  CHECK (estado <> 'ok' OR tarificacion_id IS NOT NULL OR modo = 'exploracion');

-- Una exploración VIVA por correduría y compañía (ritmo humano; un portal, una sesión de bot explorando).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajo_exploracion_viva ON seguros.tarificacion_trabajos (correduria_id, compania)
  WHERE modo = 'exploracion' AND estado IN ('pendiente', 'en_curso', 'error_reintentable');

-- El ancla tiene que ser REAL y del MISMO cliente: un trabajo `tarificar` suyo (misma correduría) o una oportunidad suya.
-- Así un NIF real nunca entra en una exploración «elegida al azar». En un trigger (un CHECK no puede mirar otra fila).
CREATE OR REPLACE FUNCTION seguros.tarificacion_exploracion_ancla_valida() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  o_modo text; o_cliente uuid; o_corr uuid;
BEGIN
  IF NEW.modo IS DISTINCT FROM 'exploracion' OR NEW.cliente_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.trabajo_origen_id IS NOT NULL THEN
    SELECT t.modo, t.cliente_id, t.correduria_id INTO o_modo, o_cliente, o_corr
      FROM seguros.tarificacion_trabajos t WHERE t.id = NEW.trabajo_origen_id;
    IF NOT FOUND OR o_modo IS DISTINCT FROM 'tarificar' OR o_cliente IS DISTINCT FROM NEW.cliente_id OR o_corr IS DISTINCT FROM NEW.correduria_id THEN
      RAISE EXCEPTION 'exploración %: el trabajo origen no es una tarificación del mismo cliente y correduría', NEW.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.oportunidad_id IS NOT NULL THEN
    SELECT o.cliente_id, o.correduria_id INTO o_cliente, o_corr
      FROM seguros.oportunidades o WHERE o.id = NEW.oportunidad_id;
    IF NOT FOUND OR o_cliente IS DISTINCT FROM NEW.cliente_id OR o_corr IS DISTINCT FROM NEW.correduria_id THEN
      RAISE EXCEPTION 'exploración %: la oportunidad no es del mismo cliente y correduría', NEW.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- CREATE OR REPLACE TRIGGER (PG14+): un DROP + CREATE en la misma sentencia colgó el cliente MCP (ver 2026-10-10).
CREATE OR REPLACE TRIGGER tarificacion_exploracion_ancla_valida
  BEFORE INSERT OR UPDATE OF modo, cliente_id, trabajo_origen_id, oportunidad_id, correduria_id ON seguros.tarificacion_trabajos
  FOR EACH ROW EXECUTE FUNCTION seguros.tarificacion_exploracion_ancla_valida();

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Cabecera de la exploración (y su MAPA)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_exploraciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias (id),
  trabajo_id         uuid NOT NULL UNIQUE REFERENCES seguros.tarificacion_trabajos (id),
  -- Clave de ENTRADAS_EXPLORACION (lista cerrada en el código): `allianz:particulares:hogar`…
  entrada            text NOT NULL CHECK (entrada ~ '^[a-z0-9_]{1,40}:[a-z0-9_]{1,40}:[a-z0-9_]{1,40}$'),
  compania           text NOT NULL CHECK (compania ~ '^[a-z0-9_]{1,40}$'),
  producto           text NOT NULL CHECK (producto ~ '^[a-z0-9_]{1,40}$'),
  -- Slug de OpenRouter con el que se pidió (TARIFICADOR_EXPLORADOR_MODELO). NULL = aún sin llamadas.
  modelo             text CHECK (modelo IS NULL OR modelo ~ '^[a-z0-9][a-z0-9-]{0,40}/[a-z0-9][a-z0-9._:-]{0,80}$'),
  -- Espejo de `tarificacion_trabajos.cliente_id IS NOT NULL` en el alta (para la pantalla, sin cruzar la cartera).
  con_datos_reales   boolean NOT NULL DEFAULT false,
  -- MapaExploracion v1 (validarMapa). NULL hasta el cierre.
  mapa               jsonb CHECK (mapa IS NULL OR (jsonb_typeof(mapa) = 'object' AND mapa->>'version' = '1')),
  estado_mapa        text NOT NULL DEFAULT 'borrador' CHECK (estado_mapa IN ('borrador', 'revisado', 'descartado')),
  revisado_por       text,
  revisado_at        timestamptz,
  motivo_fin         text CHECK (motivo_fin IS NULL OR motivo_fin ~ '^[a-z_]{2,40}$'),
  llamadas_ia        integer NOT NULL DEFAULT 0 CHECK (llamadas_ia >= 0),
  -- Suma de las ESTIMACIONES (a la alta) de cada llamada; el coste REAL está en `ai_usos` (cliente_ref).
  coste_estimado_eur numeric(10, 6) NOT NULL DEFAULT 0 CHECK (coste_estimado_eur >= 0),
  solicitado_por     text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  cerrada_at         timestamptz,
  CONSTRAINT exploracion_revisada_con_quien CHECK (estado_mapa <> 'revisado' OR (revisado_por IS NOT NULL AND revisado_at IS NOT NULL AND mapa IS NOT NULL))
);

-- Memoria: los mapas de una compañía/producto, el revisado primero.
CREATE INDEX IF NOT EXISTS tarificador_exploraciones_memoria
  ON seguros.tarificador_exploraciones (correduria_id, compania, producto, estado_mapa, cerrada_at DESC)
  WHERE mapa IS NOT NULL;

COMMENT ON TABLE seguros.tarificador_exploraciones IS
  'Explorador IA del tarificador RPA: una fila por trabajo modo exploracion. El MAPA (jsonb v1) lo construye asegura a '
  'partir de los pasos validados; una persona lo marca revisado y se convierte en adaptador (código, sin IA). Sin PII.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Los pasos (una pantalla cada uno)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_exploracion_pasos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias (id),
  exploracion_id     uuid NOT NULL REFERENCES seguros.tarificador_exploraciones (id),
  trabajo_id         uuid NOT NULL REFERENCES seguros.tarificacion_trabajos (id),
  n                  integer NOT NULL CHECK (n >= 1),
  huella             text NOT NULL CHECK (huella ~ '^[0-9a-f]{16}$'),
  -- InventarioDom saneado (≤60 KB por construcción; se comprueba el tamaño por si acaso).
  inventario         jsonb NOT NULL CHECK (jsonb_typeof(inventario) = 'object' AND pg_column_size(inventario) <= 200000),
  -- RespuestaExplorador VALIDADA que se mandó al worker (incluida la de `parar`).
  respuesta          jsonb NOT NULL CHECK (jsonb_typeof(respuesta) = 'object'),
  -- De dónde salió: la IA (aunque su respuesta se rechazara: `errores`), el mapa (memoria) o una regla determinista
  -- (parada OTP/CAPTCHA/emisión, bucle, tope).
  origen             text NOT NULL CHECK (origen IN ('ia', 'mapa', 'regla')),
  llamada_ia         boolean NOT NULL DEFAULT false,
  -- Errores del validador si la respuesta de la IA se rechazó (sin el texto de la IA).
  errores            jsonb CHECK (errores IS NULL OR jsonb_typeof(errores) = 'array'),
  coste_estimado_eur numeric(10, 6) NOT NULL DEFAULT 0 CHECK (coste_estimado_eur >= 0),
  acciones           integer NOT NULL DEFAULT 0 CHECK (acciones >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exploracion_paso_unico UNIQUE (exploracion_id, n),
  CONSTRAINT exploracion_paso_ia_coherente CHECK (llamada_ia = (origen = 'ia'))
);

CREATE INDEX IF NOT EXISTS tarificador_exploracion_pasos_por_exploracion
  ON seguros.tarificador_exploracion_pasos (exploracion_id, n);

COMMENT ON TABLE seguros.tarificador_exploracion_pasos IS
  'Explorador IA: cada pantalla visitada (huella + inventario SANEADO + respuesta validada). Sin valores ni PII.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Permisos
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificador_exploraciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_exploracion_pasos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_exploraciones, seguros.tarificador_exploracion_pasos FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_exploraciones, seguros.tarificador_exploracion_pasos TO prisma_seguros;
-- Sin DELETE para el rol de la app (los privilegios por defecto del esquema se lo daban).
REVOKE DELETE ON seguros.tarificador_exploraciones, seguros.tarificador_exploracion_pasos FROM prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select modo, count(*) from seguros.tarificacion_trabajos group by 1;            -- sin 'exploracion' todavía
--   select count(*) from seguros.tarificacion_trabajos where cliente_id is null;    -- 0
-- Ensayo (BEGIN … ROLLBACK), con ids reales de una correduría:
--   · trabajo modo 'tarificar' sin cliente_id → 23514 (trabajo_cliente_salvo_exploracion);
--   · exploración sin cliente CON oportunidad_id → 23514 (trabajo_exploracion_ancla);
--   · exploración con cliente_id y trabajo_origen_id de OTRO cliente → 23514 (trigger);
--   · exploración con cliente_id y oportunidad de ese cliente → OK;
--   · dos exploraciones 'pendiente' de la misma correduría y compañía → 23505;
--   · exploración en 'ok' sin tarificacion_id → OK; tarificar en 'ok' sin ella → 23514.
-- ════════════════════════════════════════════════════════════════════════════
