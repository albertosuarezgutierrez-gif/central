-- 2026-10-19b_correduria_pendiente_tg.sql — Borrador al cliente de la correduría que espera el botón de Alberto en
-- Telegram (spec 2026-10-19 lead → propuesta §5.2; gemela de `mensajes_pendientes_tg` de huéspedes).
--
-- Una fila = un mensaje a un cliente que NO sale sin «✅ Enviar» (`clp_env:<id>`). El `id` corto es el `<p>` del
-- callback (≤ 64 bytes, sin UUID ni datos personales). Un solo uso: `UPDATE … WHERE estado = 'pendiente' RETURNING`
-- (dos pulsaciones = una gana). Caduca a los 7 días (`caduca_at`; la app la marca `caducado` al pulsar tarde).
--   · `datos` (jsonb): lo que hace falta para enviar por el puerto de asegura: clienteId, oportunidadIds, el From del
--     lead (`to`), asunto y Message-ID/References del correo. Es la misma dirección que ya guarda `correo_triaje`.
--   · `borrador`: el texto que se envía; ✏️ lo sustituye por lo que Alberto conteste (`esperando_edit`, `editado`).
-- Vive en plataforma (no en `seguros`): solo la tocan el triaje y el webhook de Telegram, y plataforma no entra en
-- `seguros`. Sin esta tabla, el triaje cae a la plantilla «para copiar» de siempre. Idempotente.

CREATE TABLE IF NOT EXISTS correduria_pendiente_tg (
  id              bigserial PRIMARY KEY,
  tipo            text NOT NULL CHECK (tipo IN ('peticion_datos', 'repregunta', 'recordatorio_cliente', 'tarificar', 'propuesta')),
  gmail_message_id text NOT NULL,
  datos           jsonb NOT NULL,
  borrador        text NOT NULL,
  tg_message_id   bigint,
  esperando_edit  boolean NOT NULL DEFAULT false,
  estado          text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'incierto', 'fallido', 'descartado', 'caducado')),
  editado         boolean NOT NULL DEFAULT false,
  resultado       jsonb,
  decidido_por    text,
  decidido_at     timestamptz,
  caduca_at       timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Un correo de lead = una petición de datos (el triaje no la duplica si reprocesa el correo).
CREATE UNIQUE INDEX IF NOT EXISTS correduria_pendiente_tg_unico ON correduria_pendiente_tg (gmail_message_id, tipo);
CREATE INDEX IF NOT EXISTS correduria_pendiente_tg_edit ON correduria_pendiente_tg (id) WHERE esperando_edit;

GRANT SELECT, INSERT, UPDATE, DELETE ON correduria_pendiente_tg TO prisma_plataforma;
GRANT USAGE, SELECT ON SEQUENCE correduria_pendiente_tg_id_seq TO prisma_plataforma;
REVOKE ALL ON correduria_pendiente_tg FROM anon, authenticated;
