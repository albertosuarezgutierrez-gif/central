-- Formador con IA del tarificador RPA (06/10/2026). Cuando el adaptador de un portal no encuentra un
-- CAMPO o una ACCIÓN PERMITIDA (lista cerrada en services/tarificador-rpa/src/formador.ts), el worker
-- pregunta a una IA qué elemento es, lo VALIDA de forma determinista y lo usa; lo aprendido se guarda
-- aquí por compañía/ramo para no volver a preguntar. Además, el MODO ACOMPAÑADO: mientras una
-- compañía/ramo no lleve N cotizaciones seguidas sin intervención de la IA, el worker le enseña cada
-- paso (pantalla + avisos) para que interprete los avisos del portal en lenguaje de correduría.
--
-- 🚨 TARIFICAR ≠ EMITIR: la IA solo SEÑALA; el worker nunca pulsa por indicación suya salvo una acción
--    de la lista cerrada, validada por texto y por `pareceEmision()`, y siempre con `ctx.pulsar()`.
--
-- ⚠️ NO APLICADA. Aplicar ANTES de desplegar las rutas `/api/tarificador/formador/*` y
--    `/api/operador/tarificador/intervenciones`. Al revés tampoco rompe nada: con la env
--    `TARIFICADOR_FORMADOR_ACTIVO` apagada el worker no las llama, y si fallan devuelve null y el
--    adaptador falla como antes.
--
-- Qué hace (una transacción; idempotente):
--   1. `tarificador_conocimiento`: selector aprendido por (correduría, compañía, ramo, clave, selector).
--   2. `tarificador_acompanamiento`: el modo acompañado por compañía/ramo (contador de éxitos seguidos).
--   3. `tarificador_intervenciones`: qué hizo la IA en cada trabajo y cuánto costó (para la intranet).
--   4. Permisos: solo `prisma_seguros` (la app). Ni `crm_seguros` ni el portal.
--
-- Sin PII: ni valores de inputs, ni riesgo, ni nada del tomador. `resumen`/`notas` llevan textos del
-- portal ya redactados (credenciales + DNI/correo/teléfono/IBAN) por el worker y otra vez por asegura.
--
-- Se deshace con: DROP TABLE seguros.tarificador_intervenciones, seguros.tarificador_acompanamiento,
-- seguros.tarificador_conocimiento;
BEGIN;

SET search_path = seguros, public;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Lo aprendido
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_conocimiento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  compania        text NOT NULL,
  ramo            text NOT NULL,
  -- Campo (etiqueta normalizada del formulario) o acción de la lista cerrada del worker.
  clave           text NOT NULL CHECK (clave ~ '^[a-z0-9_]{1,60}$'),
  tipo            text NOT NULL CHECK (tipo IN ('campo', 'accion')),
  selector        text NOT NULL CHECK (length(selector) BETWEEN 1 AND 2000),
  -- Ruta del marco (nombre del iframe o «principal»). NULL = buscar en todos.
  marco           text CHECK (marco IS NULL OR length(marco) <= 300),
  origen          text NOT NULL CHECK (origen IN ('ia', 'humano', 'codigo')),
  -- Veces que el worker confirmó que funcionó (validación determinista + uso sin error).
  confirmaciones  integer NOT NULL DEFAULT 0 CHECK (confirmaciones >= 0),
  ultimo_uso_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  notas           text CHECK (notas IS NULL OR length(notas) <= 1000),
  CONSTRAINT tarificador_conocimiento_unico UNIQUE (correduria_id, compania, ramo, clave, selector)
);

CREATE INDEX IF NOT EXISTS tarificador_conocimiento_precarga
  ON seguros.tarificador_conocimiento (correduria_id, compania, ramo, confirmaciones DESC);

COMMENT ON TABLE seguros.tarificador_conocimiento IS
  'Formador del tarificador RPA: selector que resolvió un campo o una acción PERMITIDA en el portal de una '
  'compañía/ramo. Lo precarga el worker antes de preguntar a la IA. Sin valores ni PII.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Modo acompañado
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_acompanamiento (
  correduria_id    uuid NOT NULL REFERENCES seguros.corredurias (id),
  compania         text NOT NULL,
  ramo             text NOT NULL,
  -- Sin fila = ACTIVO (una compañía/ramo nueva empieza acompañada).
  activo           boolean NOT NULL DEFAULT true,
  exitos_seguidos  integer NOT NULL DEFAULT 0 CHECK (exitos_seguidos >= 0),
  umbral           integer NOT NULL DEFAULT 10 CHECK (umbral BETWEEN 1 AND 1000),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (correduria_id, compania, ramo)
);

COMMENT ON TABLE seguros.tarificador_acompanamiento IS
  'Modo acompañado del tarificador RPA por compañía/ramo: activo hasta `umbral` cotizaciones seguidas sin '
  'intervención de la IA; un fallo lo reactiva y pone el contador a cero (siguienteAcompanamiento).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Intervenciones de la IA por trabajo
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_intervenciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  trabajo_id      uuid NOT NULL REFERENCES seguros.tarificacion_trabajos (id),
  -- sugerir: login|formulario|… no aplica → 'formador'; revisar-paso: el paso revisado.
  paso            text NOT NULL CHECK (paso IN ('formador', 'login', 'formulario', 'tras_calcular', 'resultado', 'proyecto')),
  -- sugerencia (la IA señaló un elemento) · sin_sugerencia · revision (paso revisado sin problema)
  -- · aviso_bloqueante · incidencia_precio (regla determinista) · confirmacion (el worker confirmó)
  -- · error_ia · tope (se agotó el presupuesto del trabajo) · cierre (UNA por trabajo: movió el contador).
  tipo            text NOT NULL CHECK (tipo IN ('sugerencia', 'sin_sugerencia', 'revision', 'aviso_bloqueante', 'incidencia_precio', 'confirmacion', 'error_ia', 'tope', 'cierre')),
  -- Cuenta como llamada a la IA (para el tope por trabajo).
  llamada_ia      boolean NOT NULL DEFAULT false,
  resumen         text NOT NULL CHECK (length(resumen) <= 2000),
  -- Euros estimados (tokens × tarifa de referencia): orientativo, el coste real está en `ai_usos`.
  coste_estimado  numeric(10, 6) NOT NULL DEFAULT 0 CHECK (coste_estimado >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tarificador_intervenciones_por_trabajo
  ON seguros.tarificador_intervenciones (trabajo_id, created_at);
-- Un cierre por trabajo: un segundo aviso del worker no vuelve a mover el contador del modo acompañado.
CREATE UNIQUE INDEX IF NOT EXISTS tarificador_intervenciones_un_cierre
  ON seguros.tarificador_intervenciones (trabajo_id) WHERE tipo = 'cierre';
CREATE INDEX IF NOT EXISTS tarificador_intervenciones_por_correduria
  ON seguros.tarificador_intervenciones (correduria_id, created_at DESC);

COMMENT ON TABLE seguros.tarificador_intervenciones IS
  'Lo que la IA del formador/acompañante hizo en cada trabajo del tarificador RPA y su coste estimado. '
  'Lo enseña la intranet (GET /api/operador/tarificador/intervenciones). Sin PII.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Permisos
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificador_conocimiento   ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_acompanamiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_intervenciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_conocimiento, seguros.tarificador_acompanamiento, seguros.tarificador_intervenciones
  FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.tarificador_conocimiento TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_acompanamiento TO prisma_seguros;
-- Sin UPDATE/DELETE: es el rastro de lo que hizo la IA (y de lo que costó).
GRANT SELECT, INSERT ON seguros.tarificador_intervenciones TO prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select count(*) from seguros.tarificador_conocimiento;    -- 0
--   select count(*) from seguros.tarificador_acompanamiento;  -- 0 (sin fila = acompañado)
--   select count(*) from seguros.tarificador_intervenciones;  -- 0
-- ════════════════════════════════════════════════════════════════════════════
