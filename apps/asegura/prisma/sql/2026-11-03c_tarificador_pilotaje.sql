-- 2026-11-03c — MODO PILOTADO del tarificador RPA (esquema). Código: apps/asegura/lib/tarificador-pilotaje*.ts, rutas
-- /api/tarificador/pilotaje/* (worker) y /api/operador/tarificador/pilotaje* (operador); worker: services/tarificador-rpa/src/pilotaje.ts.
--
-- Qué es: un trabajo `modo = 'pilotaje'` (SINTÉTICO: sin cliente, riesgo `{}`) hace login + la ENTRADA cerrada del explorador y
-- luego, pantalla a pantalla, PUBLICA el estado (inventario saneado + captura PNG en Storage privado) y ESPERA un comando que
-- escribe una persona/agente (pulsar | rellenar | seleccionar | esperar | volver | fin). Cada comando se ejecuta SIEMPRE por la
-- puerta del guard del worker (validador del explorador + `pulsar()`/puertas autorizadas de guard.ts); un rechazo queda en
-- `resultado` y NO se ejecuta. TARIFICAR ≠ EMITIR. Topes duros en el worker: 60 comandos, 30 min, 10 min sin comando → cierra.
--
-- ⚠️ NO APLICADA. El código es fail-closed sin ella (rutas 503 `pilotaje_sin_esquema`; el CHECK de `modo` no admite 'pilotaje').
-- Requiere 2026-10-13_tarificador_explorador.sql y 2026-10-15d_tarificador_humo.sql. Tras aplicarla: imagen del worker que declare
-- `pilotaje` en `X-Tarificador-Modos` (si no, asegura no le sirve el trabajo) y TARIFICADOR_EXPLORADOR_ACTIVO=1 (el mismo interruptor).
-- La captura necesita SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) en central-asegura; sin ellas el paso se
-- publica igual con `captura_ruta = NULL`.
--
-- Sin PII: datos ficticios (sesión sintética); el inventario lo sanea el worker y lo REDACTA otra vez asegura
-- (`redactarValoresInventario`) antes de guardarlo. La captura es una imagen de la pantalla: va a un bucket PRIVADO sin policies
-- (solo service_role) y se lee con URL firmada de 10 min.
--
-- Se deshace con: DROP TABLE seguros.tarificador_pilotaje_pasos, seguros.tarificador_pilotaje_sesiones; DROP INDEX
-- seguros.idx_trabajo_pilotaje_vivo; DROP CONSTRAINT trabajo_pilotaje_sin_anclas, trabajo_pilotaje_riesgo_vacio; restaurar los CHECK
-- `tarificacion_trabajos_modo_valido`, `trabajo_cliente_salvo_exploracion`, `trabajo_ok_con_tarificacion` sin 'pilotaje' (con ningún
-- trabajo `pilotaje` en la tabla) y borrar el bucket `tarificador-pilotaje` (vacío).

BEGIN;

SET search_path = seguros, public;

-- 1. El modo (se conservan los vigentes: tarificar, emision, exploracion, humo).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_modo_valido;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_modo_valido
  CHECK (modo IN ('tarificar', 'emision', 'exploracion', 'humo', 'pilotaje'));

ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_cliente_salvo_exploracion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_cliente_salvo_exploracion
  CHECK (modo IN ('exploracion', 'humo', 'pilotaje') OR cliente_id IS NOT NULL);

-- Un pilotaje no cuelga de nada de la cartera y su riesgo va VACÍO (nunca datos de nadie).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_pilotaje_sin_anclas;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_pilotaje_sin_anclas
  CHECK (modo <> 'pilotaje' OR (cliente_id IS NULL AND poliza_id IS NULL AND oportunidad_id IS NULL AND trabajo_origen_id IS NULL
                                AND presupuesto_id IS NULL AND opcion_id IS NULL AND emision_prima_cents IS NULL));
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_pilotaje_riesgo_vacio;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_pilotaje_riesgo_vacio
  CHECK (modo <> 'pilotaje' OR riesgo = '{}'::jsonb);

ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_ok_con_tarificacion;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_ok_con_tarificacion
  CHECK (estado <> 'ok' OR tarificacion_id IS NOT NULL OR modo IN ('exploracion', 'humo', 'pilotaje'));

-- Un pilotaje vivo por correduría y compañía (una sola sesión con la credencial).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trabajo_pilotaje_vivo ON seguros.tarificacion_trabajos (correduria_id, compania)
  WHERE modo = 'pilotaje' AND estado IN ('pendiente', 'en_curso', 'error_reintentable');

-- 2. Cabecera de la sesión (sesion_id = id del trabajo).
CREATE TABLE IF NOT EXISTS seguros.tarificador_pilotaje_sesiones (
  sesion_id      uuid PRIMARY KEY REFERENCES seguros.tarificacion_trabajos (id),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias (id),
  entrada        text NOT NULL CHECK (entrada ~ '^[a-z0-9_]{1,40}:[a-z0-9_]{1,40}:[a-z0-9_]{1,40}$'),
  solicitado_por text NOT NULL,
  motivo_fin     text CHECK (motivo_fin IS NULL OR motivo_fin ~ '^[a-z_]{2,40}$'),
  created_at     timestamptz NOT NULL DEFAULT now(),
  cerrada_at     timestamptz
);

-- 3. Los pasos: una pantalla publicada por el worker + el comando que se le da + lo que pasó al ejecutarlo.
--    estado: 'esperando' (publicado, sin comando servido) → 'ejecutando' (el worker lo recogió) → 'hecho' | 'rechazado'
--            | 'sin_comando' (venció la espera) | 'final' (pantalla de cierre: no admite comando).
CREATE TABLE IF NOT EXISTS seguros.tarificador_pilotaje_pasos (
  sesion_id     uuid NOT NULL REFERENCES seguros.tarificador_pilotaje_sesiones (sesion_id),
  n             integer NOT NULL CHECK (n BETWEEN 1 AND 200),
  estado        text NOT NULL DEFAULT 'esperando' CHECK (estado IN ('esperando', 'ejecutando', 'hecho', 'rechazado', 'sin_comando', 'final')),
  -- InventarioDom saneado y redactado (mismo formato que tarificador_exploracion_pasos.inventario).
  inventario    jsonb NOT NULL CHECK (jsonb_typeof(inventario) = 'object' AND pg_column_size(inventario) <= 200000),
  -- Ruta del PNG en el bucket privado `tarificador-pilotaje` (pilotaje/<sesion>/<n>.png). NULL = sin captura (sin Storage o falló).
  captura_ruta  text CHECK (captura_ruta IS NULL OR captura_ruta ~ '^pilotaje/[0-9a-f-]{36}/[0-9]{1,3}\.png$'),
  url           text CHECK (url IS NULL OR length(url) <= 300),
  -- {accion:'pulsar'|'rellenar'|'seleccionar'|'esperar'|'volver'|'fin', ref?, valor?, dato?, efecto?, ms?}. Lo escribe el operador.
  comando       jsonb CHECK (comando IS NULL OR (jsonb_typeof(comando) = 'object' AND pg_column_size(comando) <= 2000)),
  comando_at    timestamptz,
  -- {estado:'hecho'|'rechazado'|..., motivo?, detalle?[]} sin valores. Lo escribe el worker con el paso siguiente o el cierre.
  resultado     jsonb CHECK (resultado IS NULL OR (jsonb_typeof(resultado) = 'object' AND pg_column_size(resultado) <= 8000)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sesion_id, n),
  -- El comando solo se puede poner (o cambiar) mientras la fila espera: cuando el worker lo recoge, queda congelado.
  CONSTRAINT pilotaje_paso_comando_coherente CHECK (estado <> 'ejecutando' OR comando IS NOT NULL)
);

COMMENT ON TABLE seguros.tarificador_pilotaje_pasos IS
  'Modo pilotado del tarificador RPA: cada pantalla publicada (inventario SANEADO, captura en Storage privado) + el comando del '
  'operador + su resultado. Todo comando pasa por el guard del worker (TARIFICAR ≠ EMITIR). Datos ficticios, sin PII.';

-- 4. Permisos (mismo patrón que tarificador_exploraciones): RLS sin policies, nada público, la app sin DELETE.
ALTER TABLE seguros.tarificador_pilotaje_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_pilotaje_pasos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_pilotaje_sesiones, seguros.tarificador_pilotaje_pasos FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_pilotaje_sesiones, seguros.tarificador_pilotaje_pasos TO prisma_seguros;
REVOKE DELETE ON seguros.tarificador_pilotaje_sesiones, seguros.tarificador_pilotaje_pasos FROM prisma_seguros;

-- 5. Bucket PRIVADO de las capturas (sin policies en storage.objects: solo service_role lee/escribe; se lee con URL firmada).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tarificador-pilotaje', 'tarificador-pilotaje', false, 4194304, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 4194304, allowed_mime_types = ARRAY['image/png'];

COMMIT;

-- Comprobación tras aplicar:
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'seguros.tarificacion_trabajos'::regclass
--     and conname in ('tarificacion_trabajos_modo_valido','trabajo_cliente_salvo_exploracion','trabajo_pilotaje_sin_anclas','trabajo_ok_con_tarificacion');
--   select relrowsecurity from pg_class where oid in ('seguros.tarificador_pilotaje_pasos'::regclass, 'seguros.tarificador_pilotaje_sesiones'::regclass); -- t, t
--   select has_table_privilege('anon', 'seguros.tarificador_pilotaje_pasos', 'select');   -- f
--   select public from storage.buckets where id = 'tarificador-pilotaje';                 -- f
