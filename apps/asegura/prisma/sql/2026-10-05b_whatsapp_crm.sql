-- 2026-10-05b — WhatsApp (Cloud API de Meta, SOLO ENTRANTE + ecos del móvil en Coexistence) → CRM.
-- Código: apps/asegura/app/api/webhooks/whatsapp, lib/whatsapp/*, crons whatsapp-analizar y
-- whatsapp-retencion, /api/operador/whatsapp/conversaciones. Doc: apps/asegura/docs/WHATSAPP.md.
--
-- REUTILIZA las tres tablas heredadas del CRM antiguo (estaban en BD sin código):
--   · channel_inbound_messages — el crudo de Meta, una fila por mensaje, dedupe por
--     uq_channel_inbound_external (channel, direction, external_message_id = wamid).
--   · conversaciones — una por correduría + teléfono.
--   · mensajes — los mensajes de cada conversación.
-- Solo AÑADE columnas e índices nuevos (todas nullable o con default): nada heredado cambia.
--
-- 🧩 Adaptaciones al DDL heredado (no se toca, se respeta):
--   · `conversaciones_cliente_or_lead_ck` exige cliente_id O lead_wa_phone no vacío, y lead_wa_phone
--     es varchar(30). Una conversación SIN ficha (pendiente_clasificar) no puede llevar el teléfono
--     en claro (RGPD: el número es el personal de Alberto y escriben familia y amigos): el código
--     pone en lead_wa_phone un SEUDÓNIMO `h:` + 28 hex del hash, nunca el número.
--   · `uq_conversaciones_cliente_canonica` admite UNA conversación por cliente con wa_thread_id
--     NULL. Para poder tener una por TELÉFONO (un cliente con dos móviles), el código rellena
--     wa_thread_id = 'wa:' + hash y la clave real es el índice nuevo uq_conversaciones_wa_telefono.
--   · mensajes.rol (varchar sin CHECK, heredado cliente|bot|corredor): entrante = 'cliente',
--     eco saliente del móvil = 'corredor'. La dirección explícita va en la columna nueva.
--   · mensajes.contenido es NOT NULL: purgar = '' + texto_purgado_at, no NULL.
--
-- 🔐 El texto (mensajes.contenido) se guarda CIFRADO con encryptField; el teléfono, cifrado
-- (wa_telefono_cifrado) + hash (wa_telefono_hash). El crudo de Meta en channel_inbound_messages se
-- MINIMIZA al procesarlo (sin texto, sin nombre de perfil, sin número): payload_minimizado_at.
--
-- Idempotente (IF NOT EXISTS). Índices únicos SOLO sobre columnas nuevas (todas NULL al aplicar):
-- no pueden fallar por filas heredadas duplicadas.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS seguros.uq_conversaciones_wa_telefono;
--   DROP INDEX IF EXISTS seguros.idx_conversaciones_wa_pendientes;
--   DROP INDEX IF EXISTS seguros.uq_mensajes_wa_conversacion;
--   DROP INDEX IF EXISTS seguros.idx_mensajes_conversacion_enviado;
--   DROP INDEX IF EXISTS seguros.idx_mensajes_retencion;
--   ALTER TABLE seguros.conversaciones
--     DROP COLUMN IF EXISTS wa_telefono_hash, DROP COLUMN IF EXISTS wa_telefono_cifrado,
--     DROP COLUMN IF EXISTS wa_perfil_nombre_cifrado, DROP COLUMN IF EXISTS clientes_candidatos,
--     DROP COLUMN IF EXISTS ultimo_mensaje_at, DROP COLUMN IF EXISTS analizada_hasta,
--     DROP COLUMN IF EXISTS analizada_at, DROP COLUMN IF EXISTS analisis, DROP COLUMN IF EXISTS analisis_modelo,
--     DROP COLUMN IF EXISTS analisis_reclamado_at, DROP COLUMN IF EXISTS analisis_intentos,
--     DROP COLUMN IF EXISTS analisis_error, DROP COLUMN IF EXISTS clasificada_at;
--   ALTER TABLE seguros.mensajes
--     DROP COLUMN IF EXISTS direccion, DROP COLUMN IF EXISTS tipo, DROP COLUMN IF EXISTS enviado_at,
--     DROP COLUMN IF EXISTS estado, DROP COLUMN IF EXISTS texto_purgado_at;
--   ALTER TABLE seguros.channel_inbound_messages DROP COLUMN IF EXISTS payload_minimizado_at;
--
-- 🚨 Aplicar ANTES de poner ASEGURA_WHATSAPP_ACTIVO=1 (sin columnas el procesado falla y las filas
-- quedan en `error`, que el cron reintenta: nada se pierde, pero nada avanza).

-- ── conversaciones ─────────────────────────────────────────────────────────────
ALTER TABLE seguros.conversaciones
  ADD COLUMN IF NOT EXISTS wa_telefono_hash          text,
  ADD COLUMN IF NOT EXISTS wa_telefono_cifrado       text,
  ADD COLUMN IF NOT EXISTS wa_perfil_nombre_cifrado  text,
  -- Cuántas fichas vivas casan con el teléfono: NULL = no se ha mirado, 0 = ninguna (comprobado),
  -- n > 1 = teléfono compartido (no se vincula a ninguna: dos identidades no se funden).
  ADD COLUMN IF NOT EXISTS clientes_candidatos       integer,
  ADD COLUMN IF NOT EXISTS ultimo_mensaje_at         timestamptz,
  -- Hasta qué mensaje (su enviado_at) llegó el último análisis de la IA. NULL = nunca analizada.
  ADD COLUMN IF NOT EXISTS analizada_hasta           timestamptz,
  ADD COLUMN IF NOT EXISTS analizada_at              timestamptz,
  -- {resumen, intencion, producto, interes, …, datos_extraidos, acciones:[{tipo, resultado, motivo}]}
  ADD COLUMN IF NOT EXISTS analisis                  jsonb,
  ADD COLUMN IF NOT EXISTS analisis_modelo           text,
  ADD COLUMN IF NOT EXISTS analisis_reclamado_at     timestamptz,
  ADD COLUMN IF NOT EXISTS analisis_intentos         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analisis_error            text,
  ADD COLUMN IF NOT EXISTS clasificada_at            timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversaciones_wa_telefono
  ON seguros.conversaciones (correduria_id, wa_telefono_hash)
  WHERE wa_telefono_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversaciones_wa_pendientes
  ON seguros.conversaciones (correduria_id, ultimo_mensaje_at)
  WHERE wa_telefono_hash IS NOT NULL;

-- ── mensajes ───────────────────────────────────────────────────────────────────
ALTER TABLE seguros.mensajes
  ADD COLUMN IF NOT EXISTS direccion         varchar(10),
  ADD COLUMN IF NOT EXISTS tipo              varchar(30),
  ADD COLUMN IF NOT EXISTS enviado_at        timestamptz,
  ADD COLUMN IF NOT EXISTS estado            varchar(20),
  ADD COLUMN IF NOT EXISTS texto_purgado_at  timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mensajes_direccion_ck') THEN
    ALTER TABLE seguros.mensajes
      ADD CONSTRAINT mensajes_direccion_ck CHECK (direccion IS NULL OR direccion IN ('entrante', 'saliente'));
  END IF;
END $$;

-- Dedupe por wamid dentro de la conversación, SOLO para las filas de este canal (direccion NOT NULL):
-- las heredadas no entran en el índice y no pueden hacerlo fallar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensajes_wa_conversacion
  ON seguros.mensajes (conversacion_id, wa_message_id)
  WHERE direccion IS NOT NULL AND wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion_enviado
  ON seguros.mensajes (conversacion_id, enviado_at)
  WHERE direccion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mensajes_retencion
  ON seguros.mensajes (enviado_at)
  WHERE direccion IS NOT NULL AND texto_purgado_at IS NULL;

-- ── channel_inbound_messages ───────────────────────────────────────────────────
ALTER TABLE seguros.channel_inbound_messages
  ADD COLUMN IF NOT EXISTS payload_minimizado_at timestamptz;

-- ── Permisos (PROPUESTA, comentada a propósito) ────────────────────────────────
-- Estas tablas guardan conversaciones privadas. Por los privilegios por defecto del schema, el CRM
-- de Manuel (`crm_seguros`) puede leerlas. Antes de descomentar, confirmar que su repo no escribe
-- en ellas (era su bot de WhatsApp):
-- REVOKE ALL ON seguros.conversaciones, seguros.mensajes, seguros.channel_inbound_messages FROM crm_seguros;
-- REVOKE ALL ON seguros.conversaciones, seguros.mensajes, seguros.channel_inbound_messages FROM anon, authenticated;
