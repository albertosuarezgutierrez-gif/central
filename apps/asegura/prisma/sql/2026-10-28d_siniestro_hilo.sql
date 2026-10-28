-- 2026-10-28 — Hilo de conversación por siniestro (corredor ↔ IA ↔ compañía) + cierre con resultado.
-- SIN APLICAR: lo aplica Alberto.
--
-- Qué añade (todo ADITIVO e idempotente):
--   1. `seguros.siniestro_mensajes`: SOLO-AÑADIR. Un mensaje por fila; el TEXTO va CIFRADO en la app con
--      `encryptField` de `@central/module-seguros-pii` (el mismo AES-256-GCM de `siniestros.lugar_direccion` y de los
--      terceros), así que aquí es un `text` opaco `v1:…`. Nada de esto toca `siniestros.comentario` ni su flujo.
--      · Sin endpoint de edición ni de borrado (cepo `test/regression-siniestro-hilo.test.ts`).
--      · Permisos: `prisma_seguros` SELECT + INSERT y nada más; además un trigger rechaza UPDATE/DELETE para TODOS
--        (también el propietario), con UNA excepción: que `documentos` borre el adjunto y la FK ponga
--        `documento_id` a NULL (ON DELETE SET NULL; la purga RGPD borra documentos y no debe quedarse atascada).
--   2. `seguros.siniestros`: `resultado` ('ganado'|'perdido'|'parcial'), `resultado_motivo`, `resultado_at`.
--      NULL = sin cerrar con resultado (no «perdido»). `resultado` y `resultado_at` van juntos (CHECK).
--
-- Orden: el CÓDIGO va antes que el SQL. Sin esta migración el puerto responde 503 `sin_migracion` en
-- `/api/operador/siniestro/hilo`, `/siniestro/cierre` y `/siniestros/esperando` (nunca un hilo vacío inventado).
--
-- RGPD: el texto puede llevar datos personales (por eso va cifrado). Al ser solo-añadir, una supresión (art. 17)
-- de una ficha NO borra estas filas sola: hoy se haría por SQL escrito, desactivando el trigger dentro de la misma
-- transacción (`ALTER TABLE … DISABLE TRIGGER siniestro_mensajes_solo_anadir`) y volviéndolo a activar.
--
-- Reversible (si no hay filas):
--   DROP TABLE IF EXISTS seguros.siniestro_mensajes;
--   DROP FUNCTION IF EXISTS seguros.siniestro_mensajes_solo_anadir();
--   ALTER TABLE seguros.siniestros DROP CONSTRAINT IF EXISTS siniestros_resultado_ck,
--     DROP CONSTRAINT IF EXISTS siniestros_resultado_at_ck,
--     DROP COLUMN IF EXISTS resultado, DROP COLUMN IF EXISTS resultado_motivo, DROP COLUMN IF EXISTS resultado_at;

BEGIN;

-- ── 1. siniestro_mensajes ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seguros.siniestro_mensajes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id uuid NOT NULL REFERENCES seguros.corredurias (id),
  siniestro_id  uuid NOT NULL REFERENCES seguros.siniestros (id) ON DELETE RESTRICT,
  autor         text NOT NULL CHECK (autor IN ('compania', 'ia', 'corredor', 'interna')),
  tipo          text NOT NULL CHECK (tipo IN ('comentario', 'rehuse', 'analisis', 'borrador', 'enviado', 'nota')),
  -- CIFRADO en la app (`v1:iv:ct:tag`). El tope de 50.000 caracteres del texto en claro lo pone la app; aquí solo
  -- se impide el vacío y un tamaño absurdo (el cifrado en base64 crece ~1,4×).
  texto         text NOT NULL CHECK (texto <> '' AND char_length(texto) <= 200000),
  documento_id  uuid REFERENCES seguros.documentos (id) ON DELETE SET NULL,
  creado_por    text NOT NULL CHECK (creado_por <> '' AND char_length(creado_por) <= 200),
  creado_at     timestamptz NOT NULL DEFAULT now(),
  -- Solo metadatos (modelo de IA, documento usado, citas verificadas, `reclamacionSac`). Sin texto en claro.
  meta          jsonb CHECK (meta IS NULL OR jsonb_typeof(meta) = 'object')
);

CREATE INDEX IF NOT EXISTS siniestro_mensajes_siniestro_creado
  ON seguros.siniestro_mensajes (siniestro_id, creado_at);
-- Contador «Hoy» (`/siniestros/esperando`): últimos `enviado` del corredor y respuestas de la compañía, por correduría.
CREATE INDEX IF NOT EXISTS siniestro_mensajes_correduria_autor
  ON seguros.siniestro_mensajes (correduria_id, autor, tipo, siniestro_id, creado_at);

ALTER TABLE seguros.siniestro_mensajes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE seguros.siniestro_mensajes IS
  'Hilo por siniestro (2026-10-28): solo-añadir; texto CIFRADO en la app (encryptField). Sin endpoint de edición/borrado.';

-- Solo-añadir también para el propietario. Única UPDATE admitida: la de la FK al borrar el documento adjunto
-- (documento_id → NULL y NADA más cambia).
CREATE OR REPLACE FUNCTION seguros.siniestro_mensajes_solo_anadir()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF tg_op = 'UPDATE'
     AND OLD.documento_id IS NOT NULL AND NEW.documento_id IS NULL
     AND NEW.id = OLD.id AND NEW.correduria_id = OLD.correduria_id AND NEW.siniestro_id = OLD.siniestro_id
     AND NEW.autor = OLD.autor AND NEW.tipo = OLD.tipo AND NEW.texto = OLD.texto
     AND NEW.creado_por = OLD.creado_por AND NEW.creado_at = OLD.creado_at
     AND NEW.meta IS NOT DISTINCT FROM OLD.meta THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'siniestro_mensajes es solo-añadir (intento de % en %)', tg_op, tg_table_name;
END;
$fn$;

DROP TRIGGER IF EXISTS siniestro_mensajes_solo_anadir ON seguros.siniestro_mensajes;
CREATE TRIGGER siniestro_mensajes_solo_anadir
  BEFORE UPDATE OR DELETE ON seguros.siniestro_mensajes
  FOR EACH ROW EXECUTE FUNCTION seguros.siniestro_mensajes_solo_anadir();

-- ── 2. siniestros: cierre con resultado ──────────────────────────────────────

ALTER TABLE seguros.siniestros ADD COLUMN IF NOT EXISTS resultado text;
ALTER TABLE seguros.siniestros ADD COLUMN IF NOT EXISTS resultado_motivo text;
ALTER TABLE seguros.siniestros ADD COLUMN IF NOT EXISTS resultado_at timestamptz;

DO $$ BEGIN
  ALTER TABLE seguros.siniestros ADD CONSTRAINT siniestros_resultado_ck
    CHECK (resultado IS NULL OR resultado IN ('ganado', 'perdido', 'parcial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE seguros.siniestros ADD CONSTRAINT siniestros_resultado_at_ck
    CHECK ((resultado IS NULL) = (resultado_at IS NULL)
           AND (resultado_motivo IS NULL OR char_length(resultado_motivo) <= 2000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN seguros.siniestros.resultado IS
  'Cierre con resultado (2026-10-28): ganado|perdido|parcial. NULL = sin cerrar con resultado, NO «perdido».';

-- ── 3. Permisos (patrón de 2026-10-21 / 2026-10-07b) ─────────────────────────
-- El schema tiene default privileges `arwd`: se REVOCA explícitamente. Ni `crm_seguros` (ingesta CIMA de Manuel)
-- ni el portal ni anon/authenticated leen el hilo.
REVOKE ALL ON seguros.siniestro_mensajes FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT ON seguros.siniestro_mensajes TO prisma_seguros;
REVOKE UPDATE, DELETE, TRUNCATE ON seguros.siniestro_mensajes FROM prisma_seguros;

COMMIT;

-- Verificación tras aplicar:
--   select has_table_privilege('prisma_seguros', 'seguros.siniestro_mensajes', 'INSERT');  -- t
--   select has_table_privilege('prisma_seguros', 'seguros.siniestro_mensajes', 'UPDATE');  -- f
--   select has_table_privilege('prisma_seguros', 'seguros.siniestro_mensajes', 'DELETE');  -- f
--   select has_table_privilege('crm_seguros',    'seguros.siniestro_mensajes', 'SELECT');  -- f
--   select count(*) from seguros.siniestros where resultado is not null;                   -- 0
