-- 2026-11-03c — Regularización de RC, FASE 3: responder a la COMPAÑÍA con la cifra del cliente y cerrar a mano.
-- Código: apps/asegura/lib/regularizacion-rc-compania.ts (+ reglas puras en packages/module-seguros/src/regularizacion-rc.ts).
-- APLICADO en central el 03/11/2026 (OK de Alberto; verificado: 9 columnas, CHECKs, sin DELETE para prisma_seguros).
--
--  · `compania_estado`: NULL (aún no se ha preparado) → `borrador` (en Telegram con ✅/✏️/🏁) → `enviando` (reclamada por
--    ✅) → `enviada`. Solo con la solicitud `completada` (hay cifra del cliente).
--  · `compania_version`: sube con cada ✏️; el ✅ de un mensaje viejo de Telegram deja de valer (anti-replay, como fase 2).
--  · `compania_texto`: CIFRADO (encryptField): lleva la facturación, que en `respuesta` ya va cifrada.
--  · `compania_para` / `compania_contacto_id`: el buzón que ELIGE Alberto (✏️ «Para: …») entre los contactos ACTIVOS de esa
--    compañía en el Directorio. NULL = destinatario PENDIENTE: no se inventa (Occident escribe desde occidentinforma.com,
--    sin buzón de respuesta; su canal oficial es ingresar el suplemento en el portal de mediadores).
--  · `resuelta_at` / `resuelta_por`: «Regularización resuelta» (🏁 en Telegram o `accion: 'resolver'` del puerto). Cierra
--    también la tarea del agente de correo de esa póliza + periodo. Cierre MANUAL: no hay aún correos reales de Occident
--    que confirmen el suplemento emitido para reconocerlos solos.
--
-- CÓDIGO ANTES QUE SQL: sin estas columnas, las acciones de fase 3 del puerto contestan 503 `sin_migracion` y la fase 2
-- (petición al cliente, portal) sigue igual: ninguna sentencia de fase 2 lee estas columnas. Idempotente.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE seguros.solicitud_regularizacion
  ADD COLUMN IF NOT EXISTS compania_estado      text,
  ADD COLUMN IF NOT EXISTS compania_version     int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS compania_asunto      text,
  ADD COLUMN IF NOT EXISTS compania_texto       text,
  ADD COLUMN IF NOT EXISTS compania_para        text,
  ADD COLUMN IF NOT EXISTS compania_contacto_id uuid REFERENCES seguros.compania_contactos(id),
  ADD COLUMN IF NOT EXISTS compania_enviada_at  timestamptz,
  ADD COLUMN IF NOT EXISTS resuelta_at          timestamptz,
  ADD COLUMN IF NOT EXISTS resuelta_por         text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitud_regularizacion_compania_estado') THEN
    ALTER TABLE seguros.solicitud_regularizacion ADD CONSTRAINT solicitud_regularizacion_compania_estado
      CHECK (compania_estado IS NULL OR compania_estado IN ('borrador', 'enviando', 'enviada'));
  END IF;
  -- Solo hay respuesta a la compañía si el cliente contestó.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitud_regularizacion_compania_completada') THEN
    ALTER TABLE seguros.solicitud_regularizacion ADD CONSTRAINT solicitud_regularizacion_compania_completada
      CHECK (compania_estado IS NULL OR estado = 'completada');
  END IF;
  -- Nada sale (ni se reclama para salir) sin buzón elegido.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitud_regularizacion_compania_para') THEN
    ALTER TABLE seguros.solicitud_regularizacion ADD CONSTRAINT solicitud_regularizacion_compania_para
      CHECK (compania_estado IS NULL OR compania_estado = 'borrador' OR compania_para IS NOT NULL);
  END IF;
  -- Resuelta solo desde completada (el caso normal: el cliente dio la cifra y se comunicó a la compañía).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitud_regularizacion_resuelta') THEN
    ALTER TABLE seguros.solicitud_regularizacion ADD CONSTRAINT solicitud_regularizacion_resuelta
      CHECK (resuelta_at IS NULL OR (estado = 'completada' AND resuelta_por IS NOT NULL));
  END IF;
END $$;

COMMIT;

-- Verificación tras aplicar:
--   select column_name from information_schema.columns
--   where table_schema = 'seguros' and table_name = 'solicitud_regularizacion' and column_name like any (array['compania_%', 'resuelta_%']);  -- 9 filas
--   select has_table_privilege('prisma_seguros', 'seguros.solicitud_regularizacion', 'DELETE');  -- f (sin cambios de permisos)
