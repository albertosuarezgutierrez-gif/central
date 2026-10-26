-- 2026-10-26 — Enlace de datos `/datos/<token>`, FASE B: guardado automático y aviso de abandono.
--
-- `solicitud_datos` no tenía dónde guardar respuestas a medias: `respuestas` solo existe en una COMPLETADA (CHECK
-- `solicitud_completa_con_respuestas`), y un borrador nunca cuenta como completado. Por eso, columnas propias:
--   - `borrador`          text, CIFRADO (encryptField, como `respuestas`): lo que el cliente lleva escrito con ESE enlace.
--                         Se devuelve solo al mismo token y se borra al completar.
--   - `borrador_at`       cuándo se guardó por última vez.
--   - `ultimo_paso`       la sección (o pregunta) más avanzada con respuesta: SOLO etiquetas de la casa
--                         («Seguridad (pregunta 14 de 30)»), nunca un valor del cliente. Para el aviso de abandono.
--   - `aviso_abandono_at` SELLO: el aviso a Alberto (Telegram) de «pendiente y sin completar a las 24 h» ya salió.
--                         Una sola vez por solicitud. Nunca se escribe al cliente.
--
-- CÓDIGO ANTES QUE SQL: sin estas columnas el formulario funciona igual, sin borrador (leer → null; guardar →
-- `sin_migracion`, que el navegador calla), y el cron `/api/cron/solicitudes-abandonadas` contesta 503 `sin_migracion`.
-- Idempotente. NO aplicado: lo aplica Alberto.
BEGIN;

ALTER TABLE seguros.solicitud_datos ADD COLUMN IF NOT EXISTS borrador text;
ALTER TABLE seguros.solicitud_datos ADD COLUMN IF NOT EXISTS borrador_at timestamptz;
ALTER TABLE seguros.solicitud_datos ADD COLUMN IF NOT EXISTS ultimo_paso text;
ALTER TABLE seguros.solicitud_datos ADD COLUMN IF NOT EXISTS aviso_abandono_at timestamptz;

-- El cron busca pendientes sin sello: índice parcial pequeño.
CREATE INDEX IF NOT EXISTS solicitud_datos_abandono_idx ON seguros.solicitud_datos (created_at)
  WHERE estado = 'pendiente' AND aviso_abandono_at IS NULL;

COMMIT;
