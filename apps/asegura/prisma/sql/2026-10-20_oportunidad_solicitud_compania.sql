-- 2026-10-20 — «En la compañía»: nº de solicitud en la compañía sobre la OPORTUNIDAD + evento de correo `solicitud`.
-- SIN APLICAR: lo aplica Alberto.
--
-- Caso real: Occident manda a mediadores@ «Suscripción <ramo> - Solicitud <nº> - <tomador>» con el estado del proyecto
-- («PRIMA / PROY * PTE DOCUMENTACION», «Caducidad de solicitud»…) y un enlace a su portal (`idSubscripcio=00<nº>`).
-- Aún no hay póliza: el correo se engancha a la oportunidad por el nº de solicitud (`leerCorreoEventoAseguradora`
-- tipo `solicitud`, `apps/asegura/lib/correo-evento-bd.ts`).
--
-- 🚨 NO se añade un valor al enum `estado_comercial`. «En la compañía» = oportunidad ABIERTA con
-- `compania_solicitud_num` (como «Aparcada» = `aparcada_hasta`). Un valor nuevo del enum dejaba estas oportunidades
-- fuera de las ~35 listas de «abiertas» escritas a mano (`in ('competencia','en_negociacion','pendiente_cliente')`)
-- y no se puede quitar después (`@central/module-seguros/solicitud-compania.ts`).
--
-- Columnas nuevas en `seguros.oportunidades` (todas NULL = «no consta», nunca «no hay»):
--   · compania_solicitud_num       — nº de solicitud SIN ceros de relleno (`normalizarNumeroSolicitud`).
--   · compania_solicitud_compania  — clave de la compañía (`occident`…): el nº solo es único dentro de ella.
--   · compania_solicitud_estado    — último estado que dijo la compañía por correo (texto de su plantilla).
--   · compania_solicitud_url       — enlace al proyecto en su portal (solo https del portal de ESA compañía, mismo nº).
--   · compania_solicitud_at        — fecha del correo que dio ese estado (un correo más viejo no lo pisa).
-- `seguros.correo_evento_entrante`: tipo nuevo `solicitud` y `oportunidad_id` (a qué oportunidad se enganchó).
--
-- Orden: el código va ANTES que el SQL. Sin esta migración: el correo `solicitud` choca con el CHECK de `tipo` en la
-- RESERVA (primera escritura) → 503 `sin_migracion` (el triaje avisa por Telegram con lo leído); apuntar el nº desde
-- la oportunidad → 503 `sin_migracion`; Mi mesa lee las columnas por `to_jsonb(o)` (sin ellas, NULL: no rompe).
--
-- ADITIVA e idempotente. Reversible (solo si no hay filas `solicitud`):
--   DROP INDEX IF EXISTS seguros.oportunidades_solicitud_compania_unica;
--   ALTER TABLE seguros.oportunidades DROP COLUMN compania_solicitud_num, DROP COLUMN compania_solicitud_compania,
--     DROP COLUMN compania_solicitud_estado, DROP COLUMN compania_solicitud_url, DROP COLUMN compania_solicitud_at;
--   ALTER TABLE seguros.correo_evento_entrante DROP COLUMN oportunidad_id;
--   (y el CHECK de `tipo` como lo dejó 2026-10-14d, sin 'solicitud').

BEGIN;

ALTER TABLE seguros.oportunidades ADD COLUMN IF NOT EXISTS compania_solicitud_num      text;
ALTER TABLE seguros.oportunidades ADD COLUMN IF NOT EXISTS compania_solicitud_compania text;
ALTER TABLE seguros.oportunidades ADD COLUMN IF NOT EXISTS compania_solicitud_estado   text;
ALTER TABLE seguros.oportunidades ADD COLUMN IF NOT EXISTS compania_solicitud_url      text;
ALTER TABLE seguros.oportunidades ADD COLUMN IF NOT EXISTS compania_solicitud_at       timestamptz;

DO $$ BEGIN
  ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_solicitud_num_ck
    CHECK (compania_solicitud_num IS NULL OR compania_solicitud_num ~ '^[1-9][0-9]{5,11}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Nº y compañía van juntos: uno sin el otro no casa con ningún correo.
DO $$ BEGIN
  ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_solicitud_compania_ck
    CHECK ((compania_solicitud_num IS NULL) = (compania_solicitud_compania IS NULL)
           AND (compania_solicitud_compania IS NULL OR compania_solicitud_compania IN ('occident', 'reale', 'mapfre', 'allianz')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE seguros.oportunidades ADD CONSTRAINT oportunidades_solicitud_textos_ck
    CHECK ((compania_solicitud_estado IS NULL OR char_length(compania_solicitud_estado) <= 200)
           AND (compania_solicitud_url IS NULL OR (char_length(compania_solicitud_url) <= 1000 AND compania_solicitud_url LIKE 'https://%')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Una solicitud de una compañía cuelga de UNA oportunidad por correduría (el correo casa con una sola, nunca con dos).
CREATE UNIQUE INDEX IF NOT EXISTS oportunidades_solicitud_compania_unica
  ON seguros.oportunidades (correduria_id, compania_solicitud_compania, compania_solicitud_num)
  WHERE compania_solicitud_num IS NOT NULL;

ALTER TABLE seguros.correo_evento_entrante DROP CONSTRAINT IF EXISTS correo_evento_entrante_tipo_check;
ALTER TABLE seguros.correo_evento_entrante ADD CONSTRAINT correo_evento_entrante_tipo_check
  CHECK (tipo IN ('siniestro', 'pre_anulacion', 'impago', 'anulacion', 'suplemento', 'emision', 'solicitud'));

ALTER TABLE seguros.correo_evento_entrante ADD COLUMN IF NOT EXISTS oportunidad_id uuid
  REFERENCES seguros.oportunidades (id) ON DELETE SET NULL;

COMMENT ON COLUMN seguros.oportunidades.compania_solicitud_num IS
  '«En la compañía» (2026-10-20): nº de solicitud/proyecto en el portal de la compañía, sin ceros de relleno. NULL = no consta.';
COMMENT ON COLUMN seguros.oportunidades.compania_solicitud_at IS
  'Fecha del correo de la compañía que dio compania_solicitud_estado: un correo más antiguo no lo pisa.';

COMMIT;
