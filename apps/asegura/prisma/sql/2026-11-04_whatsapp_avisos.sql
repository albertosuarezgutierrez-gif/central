-- 2026-11-04 — WhatsApp de Grupo ASegura: aviso de vencimiento (plantilla de utilidad de Meta) — registro idempotente.
-- Código: apps/asegura/lib/whatsapp/aviso-vencimiento*.ts, lib/whatsapp-salida/plantilla.ts, cron whatsapp-aviso-vencimiento.
-- ⏳ NO APLICADA. Sin ella el cron NO envía nada (fail-closed: `sin_migracion`). Aplicar ANTES de poner
--    ASEGURA_WHATSAPP_AVISO_VENCIMIENTO_ACTIVO=1.
--
-- Una fila por (póliza|oportunidad, vencimiento): la clave única es lo que impide dos avisos del mismo vencimiento.
-- Se RESERVA antes de llamar a Meta (insert … on conflict do nothing) y se sella después: un reintento del cron o dos
-- ejecuciones a la vez nunca mandan dos. Un envío ambiguo (red/5xx) queda `fallido` y NO se reintenta solo.
-- Sin PII: ni teléfono ni texto (el mensaje enviado va, cifrado, en `mensajes`).
--
-- Se deshace con:  DROP TABLE IF EXISTS seguros.whatsapp_avisos_vencimiento;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.whatsapp_avisos_vencimiento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id      uuid NOT NULL REFERENCES seguros.clientes (id),
  conversacion_id uuid REFERENCES seguros.conversaciones (id) ON DELETE SET NULL,
  origen          text NOT NULL CHECK (origen IN ('poliza', 'oportunidad')),
  poliza_id       uuid REFERENCES seguros.polizas (id) ON DELETE SET NULL,
  oportunidad_id  uuid REFERENCES seguros.oportunidades (id) ON DELETE SET NULL,
  vencimiento     date NOT NULL,
  -- `poliza:<id>:<aaaa-mm-dd>` / `oportunidad:<id>:<aaaa-mm-dd>` (la calcula `claveAviso`).
  clave           text NOT NULL CHECK (length(clave) BETWEEN 10 AND 120),
  plantilla       text NOT NULL CHECK (length(plantilla) BETWEEN 1 AND 512),
  estado          text NOT NULL DEFAULT 'reservado' CHECK (estado IN ('reservado', 'enviado', 'fallido')),
  wamid           text,
  mensaje_id      uuid REFERENCES seguros.mensajes (id) ON DELETE SET NULL,
  -- Código/HTTP de Meta y motivo corto, sin datos del cliente.
  error           text CHECK (error IS NULL OR length(error) <= 300),
  creada_at       timestamptz NOT NULL DEFAULT now(),
  enviada_at      timestamptz,
  CONSTRAINT aviso_enviado_coherente CHECK ((estado = 'enviado') = (enviada_at IS NOT NULL)),
  CONSTRAINT aviso_ancla CHECK ((origen = 'poliza' AND poliza_id IS NOT NULL) OR (origen = 'oportunidad' AND oportunidad_id IS NOT NULL) OR (poliza_id IS NULL AND oportunidad_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_aviso_clave ON seguros.whatsapp_avisos_vencimiento (correduria_id, clave);
CREATE INDEX IF NOT EXISTS idx_wa_aviso_cliente ON seguros.whatsapp_avisos_vencimiento (correduria_id, cliente_id, creada_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_aviso_dia ON seguros.whatsapp_avisos_vencimiento (correduria_id, creada_at DESC);

COMMENT ON TABLE seguros.whatsapp_avisos_vencimiento IS
  'Avisos de vencimiento mandados por WhatsApp (plantilla de utilidad de Meta). Clave única = idempotencia. Sin teléfono ni texto.';

ALTER TABLE seguros.whatsapp_avisos_vencimiento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.whatsapp_avisos_vencimiento FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.whatsapp_avisos_vencimiento TO prisma_seguros;

COMMIT;

-- Comprobación tras aplicar:
--   select relrowsecurity from pg_class where oid = 'seguros.whatsapp_avisos_vencimiento'::regclass;
