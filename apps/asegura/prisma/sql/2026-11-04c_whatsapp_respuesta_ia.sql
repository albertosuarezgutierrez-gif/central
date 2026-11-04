-- 2026-11-04c — WhatsApp de Grupo ASegura: RESPUESTA AUTOMÁTICA de la IA + historial filtrado (decisión de Alberto 04/11/2026).
-- Spec: docs/superpowers/specs/2026-11-04-whatsapp-correduria-respuestas-crm.md § «Respuesta automática» y § «Historial».
-- Código: apps/asegura/lib/whatsapp/{respuesta-reglas,respuesta,historial,analizar}.ts, lib/whatsapp-salida/texto.ts,
--         POST /api/operador/whatsapp/propuesta { decision: 'silenciar' } (botón 🔇 `wap_si`).
--
-- Qué añade (TODO aditivo e idempotente; nada heredado cambia):
--   1. mensajes.responde_a_mensaje_id — el ENTRANTE al que contesta la IA. Índice ÚNICO parcial: NUNCA dos respuestas
--      al mismo entrante (reintentos del cron, carreras). La fila se reserva ANTES de enviar (`estado = 'enviando'`).
--   2. mensajes.generado_por — 'ia' en lo que manda la IA (NULL = persona/echo/plantilla, como hasta ahora).
--   3. conversaciones.ia_silenciada_at / ia_silenciada_por — 🔇 la IA deja de contestar en ESA conversación.
--   4. corredurias.wa_historial_resultado admite 'importado' (historial de Coexistence importado SOLO para fichas únicas).
--
-- 🔐 Sin PII nueva: el texto de la respuesta va cifrado en `mensajes.contenido` como cualquier mensaje.
-- 🛡️ Sin tablas nuevas: `mensajes` cuelga de `conversaciones` (que lleva correduria_id) y el código siempre une por ella.
-- ⏳ NO APLICADA. Hasta aplicarla, el código es fail-closed: con ASEGURA_WHATSAPP_RESPUESTA_ACTIVA=1 la lectura del estado
--    da `sin_migracion` y NO se envía nada (Telegram lo dice); el resto del analizador sigue igual. El historial importado
--    escribe el recuento sin el resultado 'importado' (no tumba el webhook). Aplicar ANTES de encender el flag.
--
-- Se deshace con:
--   DROP INDEX IF EXISTS seguros.uq_mensajes_responde_a;
--   DROP INDEX IF EXISTS seguros.idx_mensajes_respuesta_ia_dia;
--   ALTER TABLE seguros.mensajes DROP COLUMN IF EXISTS responde_a_mensaje_id, DROP COLUMN IF EXISTS generado_por;
--   ALTER TABLE seguros.conversaciones DROP COLUMN IF EXISTS ia_silenciada_at, DROP COLUMN IF EXISTS ia_silenciada_por;
--   (y el CHECK de corredurias vuelve a la lista de 2026-10-05f)

BEGIN;

SET search_path = seguros, public;

-- 1-2. Respuesta de la IA ─────────────────────────────────────────────────────────
ALTER TABLE seguros.mensajes
  ADD COLUMN IF NOT EXISTS responde_a_mensaje_id uuid REFERENCES seguros.mensajes (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generado_por          varchar(20);
ALTER TABLE seguros.mensajes DROP CONSTRAINT IF EXISTS mensajes_generado_por_valido;
ALTER TABLE seguros.mensajes ADD CONSTRAINT mensajes_generado_por_valido CHECK (generado_por IS NULL OR generado_por IN ('ia'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_mensajes_responde_a
  ON seguros.mensajes (responde_a_mensaje_id) WHERE responde_a_mensaje_id IS NOT NULL;
-- Topes diarios (por conversación y total).
CREATE INDEX IF NOT EXISTS idx_mensajes_respuesta_ia_dia
  ON seguros.mensajes (enviado_at) WHERE responde_a_mensaje_id IS NOT NULL;

COMMENT ON COLUMN seguros.mensajes.responde_a_mensaje_id IS
  'Entrante al que contesta la IA (respuesta automática de WhatsApp). Único: nunca dos respuestas al mismo entrante.';

-- 3. Silenciar la IA por conversación ─────────────────────────────────────────────
ALTER TABLE seguros.conversaciones
  ADD COLUMN IF NOT EXISTS ia_silenciada_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ia_silenciada_por varchar(80);

-- 4. Historial: nuevo resultado 'importado' ──────────────────────────────────────
ALTER TABLE seguros.corredurias DROP CONSTRAINT IF EXISTS corredurias_wa_historial_resultado_ck;
ALTER TABLE seguros.corredurias ADD CONSTRAINT corredurias_wa_historial_resultado_ck
  CHECK (wa_historial_resultado IS NULL OR wa_historial_resultado IN ('no_compartido', 'descartado', 'guardado_crudo', 'importado', 'error_meta'));

COMMIT;

-- Comprobación tras aplicar:
--   select column_name from information_schema.columns where table_schema = 'seguros'
--      and ((table_name = 'mensajes' and column_name in ('responde_a_mensaje_id', 'generado_por'))
--        or (table_name = 'conversaciones' and column_name in ('ia_silenciada_at', 'ia_silenciada_por')));
--   select indexname from pg_indexes where schemaname = 'seguros' and indexname = 'uq_mensajes_responde_a';
-- Limpieza opcional (el antiguo «guardar crudo» del historial guardaba TODOS los chats en claro; hoy no debería haber
-- ninguno porque se eligió «No compartir chats», pero si los hubiera):
--   select count(*) from seguros.channel_inbound_messages where channel = 'whatsapp' and processing_status = 'historial_sin_importar';
