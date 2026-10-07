-- 2026-10-05f — WhatsApp: CONEXIÓN de la correduría por Embedded Signup v4 (Tech Provider, sin BSP) con
-- el número de la app WhatsApp Business en Coexistence. Código: lib/whatsapp/{graph,alta,conexion,eventos}.ts,
-- POST /api/operador/whatsapp/alta, GET|POST /api/operador/whatsapp/conexion, webhook (account_update,
-- history, smb_app_state_sync, edit/revoke). Doc: apps/asegura/docs/WHATSAPP.md.
--
-- REUTILIZA las columnas heredadas de `corredurias` (estaban sin uso):
--   · wa_business_account_id ← waba_id del alta (y filtro de los account_update)
--   · wa_phone_number_id     ← phone_number_id del alta
--   · wa_access_token        ← token de negocio CIFRADO (encryptField, prefijo v1:). Si hoy guarda un token
--                              en claro del CRM antiguo, la pantalla lo dice («en_claro_heredado») y el alta
--                              lo sobrescribe.
-- Solo AÑADE columnas (todas nullable) y dos CHECK sobre columnas nuevas: nada heredado cambia.
-- Las columnas nuevas NO van al modelo Prisma a propósito (se leen con SQL crudo): así, sin este SQL,
-- solo falla lo de WhatsApp y no cualquier lectura de `correduria`.
--
-- Depende de 2026-10-05b_whatsapp_crm.sql (mensajes.direccion, etc.). Gate DDL: PR + 2 ojos.
-- Idempotente (IF NOT EXISTS).
--
-- ROLLBACK:
--   ALTER TABLE seguros.mensajes DROP COLUMN IF EXISTS editado_at, DROP COLUMN IF EXISTS revocado_at;
--   ALTER TABLE seguros.corredurias DROP CONSTRAINT IF EXISTS corredurias_wa_conexion_estado_ck,
--     DROP CONSTRAINT IF EXISTS corredurias_wa_historial_resultado_ck;
--   ALTER TABLE seguros.corredurias
--     DROP COLUMN IF EXISTS wa_business_id, DROP COLUMN IF EXISTS wa_conexion_estado,
--     DROP COLUMN IF EXISTS wa_conexion_motivo, DROP COLUMN IF EXISTS wa_conexion_evento_at,
--     DROP COLUMN IF EXISTS wa_conexion_avisado_at, DROP COLUMN IF EXISTS wa_conectada_at,
--     DROP COLUMN IF EXISTS wa_suscrita_at, DROP COLUMN IF EXISTS wa_is_on_biz_app,
--     DROP COLUMN IF EXISTS wa_platform_type, DROP COLUMN IF EXISTS wa_verificada_at,
--     DROP COLUMN IF EXISTS wa_sync_contactos_request_id, DROP COLUMN IF EXISTS wa_sync_contactos_at,
--     DROP COLUMN IF EXISTS wa_contactos_sync_recibidos, DROP COLUMN IF EXISTS wa_contactos_sync_at,
--     DROP COLUMN IF EXISTS wa_sync_historial_request_id, DROP COLUMN IF EXISTS wa_sync_historial_at,
--     DROP COLUMN IF EXISTS wa_historial_resultado, DROP COLUMN IF EXISTS wa_historial_resultado_at,
--     DROP COLUMN IF EXISTS wa_historial_hilos_descartados, DROP COLUMN IF EXISTS wa_historial_mensajes_descartados;
--   (El token cifrado que haya quedado en wa_access_token NO lo borra el rollback: si se quiere, `= null` aparte.)

-- ── corredurias: la conexión ─────────────────────────────────────────────────────
ALTER TABLE seguros.corredurias
  ADD COLUMN IF NOT EXISTS wa_business_id                     varchar(100),
  -- NULL = nunca conectada / no se sabe (la pantalla NO lo pinta como «desconectada»).
  ADD COLUMN IF NOT EXISTS wa_conexion_estado                 varchar(20),
  -- ALTA · ACCOUNT_RECONNECTED · ACCOUNT_OFFBOARDED · el disconnection_info.reason de PARTNER_REMOVED.
  ADD COLUMN IF NOT EXISTS wa_conexion_motivo                 varchar(60),
  ADD COLUMN IF NOT EXISTS wa_conexion_evento_at              timestamptz,
  -- NULL con evento = Telegram pendiente (lo manda el cron de plataforma `correduria-whatsapp-conexion`).
  ADD COLUMN IF NOT EXISTS wa_conexion_avisado_at             timestamptz,
  ADD COLUMN IF NOT EXISTS wa_conectada_at                    timestamptz,
  ADD COLUMN IF NOT EXISTS wa_suscrita_at                     timestamptz,
  -- Verificación final (GET /{phone_number_id}?fields=is_on_biz_app,platform_type). NULL = Meta no lo dijo.
  ADD COLUMN IF NOT EXISTS wa_is_on_biz_app                   boolean,
  ADD COLUMN IF NOT EXISTS wa_platform_type                   varchar(60),
  ADD COLUMN IF NOT EXISTS wa_verificada_at                   timestamptz,
  -- Syncs de Coexistence (cada una se pide UNA vez en las 24 h del alta).
  ADD COLUMN IF NOT EXISTS wa_sync_contactos_request_id       varchar(200),
  ADD COLUMN IF NOT EXISTS wa_sync_contactos_at               timestamptz,
  -- Contactos recibidos por smb_app_state_sync: SOLO el número de elementos (no se importa nada).
  ADD COLUMN IF NOT EXISTS wa_contactos_sync_recibidos        integer,
  ADD COLUMN IF NOT EXISTS wa_contactos_sync_at               timestamptz,
  ADD COLUMN IF NOT EXISTS wa_sync_historial_request_id       varchar(200),
  ADD COLUMN IF NOT EXISTS wa_sync_historial_at               timestamptz,
  -- no_compartido (error 2593109, «No compartir chats») · descartado · guardado_crudo · error_meta.
  ADD COLUMN IF NOT EXISTS wa_historial_resultado             varchar(20),
  ADD COLUMN IF NOT EXISTS wa_historial_resultado_at          timestamptz,
  ADD COLUMN IF NOT EXISTS wa_historial_hilos_descartados     integer,
  ADD COLUMN IF NOT EXISTS wa_historial_mensajes_descartados  integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corredurias_wa_conexion_estado_ck') THEN
    ALTER TABLE seguros.corredurias ADD CONSTRAINT corredurias_wa_conexion_estado_ck
      CHECK (wa_conexion_estado IS NULL OR wa_conexion_estado IN ('conectada', 'desconectada', 'baja'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corredurias_wa_historial_resultado_ck') THEN
    ALTER TABLE seguros.corredurias ADD CONSTRAINT corredurias_wa_historial_resultado_ck
      CHECK (wa_historial_resultado IS NULL OR wa_historial_resultado IN ('no_compartido', 'descartado', 'guardado_crudo', 'error_meta'));
  END IF;
END $$;

-- ── mensajes: ediciones y borrados de WhatsApp ───────────────────────────────────
-- edit → contenido sustituido (cifrado) + editado_at; revoke → contenido '' + texto_purgado_at + revocado_at.
ALTER TABLE seguros.mensajes
  ADD COLUMN IF NOT EXISTS editado_at   timestamptz,
  ADD COLUMN IF NOT EXISTS revocado_at  timestamptz;
