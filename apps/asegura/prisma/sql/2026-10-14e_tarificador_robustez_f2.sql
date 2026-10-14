-- F2 del plan de robustez de los bots RPA (14/10/2026, docs/TARIFICADOR-RPA.md «Plan de robustez»). Reglas puras en
-- packages/module-tarificacion/src/robustez.ts; BD en apps/asegura/lib/tarificador-robustez.ts.
--
--   1. APRENDIDO CON CONFIANZA: `tarificador_conocimiento` gana `fallos` (seguidos), `consolidado_at/_por` y `descartado_at`.
--      Se consolida a los 3 éxitos (o al instante si lo eligió Alberto: origen `humano`); se descarta a los 2 fallos seguidos.
--      Lo descartado deja de servirse al worker; la fila queda de rastro.
--   2. CORTE POR COMPAÑÍA/RAMO: `tarificador_pausas`. Tras 3 trabajos seguidos en `error_definitivo` por fallo del bot
--      (portal/infra) se abre una pausa: no se encola ni se reclama esa pareja hasta que Alberto la REANUDA. No toca
--      `companias_integracion` (esa fila es de configuración y la cambia una persona).
--   3. ATASCO: estado `atascado` del trabajo + `tarificador_atascos` (checkpoint: paso, candidatos numerados con su selector,
--      captura). Alberto elige un número (Telegram o «Bots atascados»); se aprende como `humano` y el MISMO trabajo vuelve a
--      `pendiente`. Sin respuesta en `caduca_at` → `error_definitivo`.
--
-- ✅ APLICADA en producción el 14/10/2026 (migración `tarificador_robustez_f2`). El código comprueba cada pieza (`esquema-bd.ts`:
--    `hayConfianzaAprendido`, `hayPausas`, `hayAtascos`) y sin ella se comporta como antes; pero el CHECK de estado tiene que
--    admitir `atascado` antes de encender `TARIFICADOR_ATASCO_ACTIVO=1`.
--
-- Sin PII: candidatos con textos ya redactados (worker + asegura), selectores de estructura (como los que ya guarda lo
-- aprendido), compañía, ramo. La captura del atasco es un documento de `seguros.documentos` (como la de cualquier fallo).
--
-- Se deshace con:
--   DROP TABLE seguros.tarificador_atascos, seguros.tarificador_pausas;
--   ALTER TABLE seguros.tarificador_conocimiento DROP COLUMN fallos, DROP COLUMN consolidado_at, DROP COLUMN consolidado_por,
--     DROP COLUMN descartado_at;
--   (y el CHECK de estado sin 'atascado', con ningún trabajo en ese estado).
BEGIN;

SET search_path = seguros, public;

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Estado `atascado`
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS tarificacion_trabajos_estado_check;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT tarificacion_trabajos_estado_check CHECK (estado IN (
  'pendiente', 'en_curso', 'ok', 'error_reintentable', 'error_definitivo', 'requiere_humano', 'cancelado',
  'pendiente_autorizacion_emision', 'autorizado_emision', 'emitido', 'atascado'));

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'seguros.tarificacion_trabajos'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%estado%''pendiente''%' AND pg_get_constraintdef(oid) NOT LIKE '%atascado%') > 0 THEN
    RAISE EXCEPTION 'queda un CHECK de estado antiguo en tarificacion_trabajos: bórralo a mano antes de seguir';
  END IF;
END $$;

-- Un atascado lleva SIEMPRE el error que lo paró (el motivo legible sale de ahí).
ALTER TABLE seguros.tarificacion_trabajos DROP CONSTRAINT IF EXISTS trabajo_fallido_con_error;
ALTER TABLE seguros.tarificacion_trabajos ADD CONSTRAINT trabajo_fallido_con_error CHECK (
  estado NOT IN ('error_reintentable', 'error_definitivo', 'requiere_humano', 'atascado') OR error IS NOT NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Aprendido con confianza
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificador_conocimiento
  ADD COLUMN IF NOT EXISTS fallos integer NOT NULL DEFAULT 0 CHECK (fallos >= 0),
  ADD COLUMN IF NOT EXISTS consolidado_at timestamptz,
  ADD COLUMN IF NOT EXISTS consolidado_por text CHECK (consolidado_por IS NULL OR length(consolidado_por) <= 200),
  ADD COLUMN IF NOT EXISTS descartado_at timestamptz;

COMMENT ON COLUMN seguros.tarificador_conocimiento.fallos IS
  'Fallos SEGUIDOS (no resolvió, no validó o se usó y el trabajo cayó sin confirmarlo). Un éxito lo pone a 0. A los 2 → descartado_at.';
COMMENT ON COLUMN seguros.tarificador_conocimiento.consolidado_at IS
  'NULL = provisional (se usa igual). Se fija a las 3 confirmaciones o al elegirlo Alberto (origen humano).';
COMMENT ON COLUMN seguros.tarificador_conocimiento.descartado_at IS
  'NULL = vivo. Fijado = ya no se sirve al worker (queda de rastro). Un éxito posterior del mismo selector lo rehabilita.';

-- Lo que ya había y llevaba ≥3 confirmaciones nace consolidado (misma regla que el código).
UPDATE seguros.tarificador_conocimiento
   SET consolidado_at = coalesce(ultimo_uso_at, created_at), consolidado_por = 'regla:3_exitos'
 WHERE consolidado_at IS NULL AND (confirmaciones >= 3 OR origen = 'humano');

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Pausas por compañía/ramo
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_pausas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  compania        text NOT NULL,
  ramo            text NOT NULL,
  motivo          text NOT NULL CHECK (length(motivo) BETWEEN 1 AND 600),
  -- Los trabajos que la dispararon (los N últimos en error).
  trabajos        uuid[] NOT NULL DEFAULT '{}',
  pausada_at      timestamptz NOT NULL DEFAULT now(),
  -- Telegram: NULL = falta avisar. Se marca SOLO si el aviso salió (plataforma).
  avisada_at      timestamptz,
  reanudada_at    timestamptz,
  reanudada_por   text CHECK (reanudada_por IS NULL OR length(reanudada_por) <= 200),
  CONSTRAINT pausa_reanudada_con_quien CHECK (reanudada_at IS NULL OR reanudada_por IS NOT NULL)
);

-- Una sola pausa VIVA por pareja (la segunda inserción no hace nada).
CREATE UNIQUE INDEX IF NOT EXISTS tarificador_pausas_una_viva
  ON seguros.tarificador_pausas (correduria_id, compania, ramo) WHERE reanudada_at IS NULL;

COMMENT ON TABLE seguros.tarificador_pausas IS
  'Corte del tarificador RPA por compañía/ramo tras 3 fallos seguidos del bot (F2). Viva = reanudada_at NULL: ni se encola '
  'ni se reclama esa pareja. La reanuda Alberto (Telegram o /correduria/tarificador).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Atascos
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.tarificador_atascos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id         uuid NOT NULL REFERENCES seguros.corredurias (id),
  trabajo_id            uuid NOT NULL REFERENCES seguros.tarificacion_trabajos (id),
  compania              text NOT NULL,
  ramo                  text NOT NULL,
  clave                 text NOT NULL CHECK (clave ~ '^[a-z0-9_]{1,60}$'),
  tipo                  text NOT NULL CHECK (tipo IN ('campo', 'accion')),
  descripcion           text NOT NULL CHECK (length(descripcion) BETWEEN 1 AND 300),
  etiqueta              text CHECK (etiqueta IS NULL OR length(etiqueta) <= 120),
  texto_esperado        text CHECK (texto_esperado IS NULL OR length(texto_esperado) <= 80),
  -- [{n, tag, id, name, type, role, texto, etiqueta, marco, selector}] (1..20), ya saneado (leerAtascoWorker).
  candidatos            jsonb NOT NULL CHECK (jsonb_typeof(candidatos) = 'array' AND jsonb_array_length(candidatos) BETWEEN 1 AND 20),
  captura_documento_id  uuid REFERENCES seguros.documentos (id) ON DELETE SET NULL,
  estado                text NOT NULL DEFAULT 'esperando' CHECK (estado IN ('esperando', 'respondido', 'descartado', 'caducado')),
  caduca_at             timestamptz NOT NULL,
  avisado_at            timestamptz,
  respondido_at         timestamptz,
  respondido_por        text CHECK (respondido_por IS NULL OR length(respondido_por) <= 200),
  -- El número elegido (NULL = no se eligió: descartado o caducado).
  eleccion              integer CHECK (eleccion IS NULL OR eleccion BETWEEN 1 AND 20),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atasco_respondido_con_eleccion CHECK (estado <> 'respondido' OR (eleccion IS NOT NULL AND respondido_at IS NOT NULL AND respondido_por IS NOT NULL))
);

-- Un solo atasco ESPERANDO por trabajo.
CREATE UNIQUE INDEX IF NOT EXISTS tarificador_atascos_uno_esperando
  ON seguros.tarificador_atascos (trabajo_id) WHERE estado = 'esperando';
CREATE INDEX IF NOT EXISTS tarificador_atascos_por_correduria
  ON seguros.tarificador_atascos (correduria_id, estado, created_at DESC);

COMMENT ON TABLE seguros.tarificador_atascos IS
  'Checkpoint de un trabajo del tarificador RPA que nadie (fijo, aprendido, IA) supo resolver (F2). Alberto elige un '
  'candidato por su número; se aprende (origen humano) y el trabajo vuelve a la cola. Sin PII.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Permisos (solo la app)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.tarificador_pausas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.tarificador_atascos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.tarificador_pausas, seguros.tarificador_atascos FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.tarificador_pausas, seguros.tarificador_atascos TO prisma_seguros;
-- Los default privileges del schema dan DELETE a la app: son rastro, se quita.
REVOKE DELETE ON seguros.tarificador_pausas, seguros.tarificador_atascos FROM prisma_seguros;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'tarificacion_trabajos_estado_check';  -- con 'atascado'
--   select count(*) filter (where consolidado_at is not null), count(*) from seguros.tarificador_conocimiento;
--   select count(*) from seguros.tarificador_pausas;   -- 0
--   select count(*) from seguros.tarificador_atascos;  -- 0
-- ════════════════════════════════════════════════════════════════════════════
