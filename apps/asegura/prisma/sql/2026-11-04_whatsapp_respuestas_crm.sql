-- 2026-11-04 — WhatsApp de Grupo ASegura: respuestas del cliente → CRM (PARTE A, trastienda).
-- Spec: docs/superpowers/specs/2026-11-04-whatsapp-correduria-respuestas-crm.md (§4 vínculo, §5 propuestas, §6 media).
-- Código: apps/asegura/lib/whatsapp/{vinculo,salientes,propuestas-reglas,propuestas,media,media-procesar}.ts,
--         POST /api/operador/whatsapp/saliente-previsto y POST /api/operador/whatsapp/propuesta.
--
-- Qué añade (TODO aditivo, idempotente, nada heredado cambia):
--   1. seguros.whatsapp_salientes_previstos — cada `wa.me` que Alberto ABRE en plataforma (origen + recibo/oportunidad/
--      póliza/solicitud + sha256 del texto NORMALIZADO, nunca el texto ni el número). El echo (`smb_message_echoes`)
--      se CASA con él (`mensaje_id`, `casado_at`, `casado_tipo`). `origen = 'generico'` (D3) admite texto_hash NULL.
--   2. seguros.whatsapp_propuestas — lo que la IA PROPONE y solo se aplica con el botón ✅ de Telegram (D1):
--      `fecha_cobro` (fecha prometida), `pagado` («ya lo pagué»), `vencimiento` (de una oportunidad). Un solo uso
--      (estado pendiente → aplicada|descartada|caducada); caduca a los 7 días.
--   3. seguros.poliza_recibos.fecha_prometida_pago (date, NULL = «no consta») — D1. Solo la escribe una propuesta
--      `fecha_cobro` APLICADA por Alberto. NO está en el modelo Prisma `PolizaRecibo` a propósito (un `findMany` sin
--      `select` la pediría y, sin este SQL aplicado, rompería toda lectura de recibos): se lee/escribe por SQL crudo.
--   4. seguros.mensajes.media_* — el media (imagen/PDF) de un mensaje ENTRANTE: estado de la descarga y el documento
--      donde quedó archivado (`documentos`, mismo almacén y cifrado que el resto). El id de Meta va en `metadata.media`.
--
-- 🔐 Sin PII: ni texto ni número (solo hashes: el del teléfono es el índice ciego de siempre, `wa_telefono_hash`).
-- 🛡️ Aislamiento: las dos tablas llevan correduria_id y todo el código las filtra por ella (BYPASSRLS).
-- ✅ APLICADA en producción el 04/11/2026 (MCP Supabase, proyecto central, schema seguros). Antes de aplicarla, el código
--    era fail-closed: los dos endpoints respondían 503 `sin_migracion`; el casado del echo, la descarga de media y las
--    propuestas no hacían nada (se registraba y seguía, nunca tumbaba el procesado del webhook). Requiere 2026-10-05b.
--
-- Se deshace con:
--   DROP TABLE IF EXISTS seguros.whatsapp_aprendizaje; -- (2026-11-04b) antes, por su FK a whatsapp_propuestas
--   DROP TABLE IF EXISTS seguros.whatsapp_propuestas;
--   DROP TABLE IF EXISTS seguros.whatsapp_salientes_previstos;
--   ALTER TABLE seguros.poliza_recibos DROP COLUMN IF EXISTS fecha_prometida_pago;
--   ALTER TABLE seguros.mensajes DROP COLUMN IF EXISTS media_estado, DROP COLUMN IF EXISTS media_documento_id;

BEGIN;

SET search_path = seguros, public;

-- 1. Salientes previstos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.whatsapp_salientes_previstos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id      uuid REFERENCES seguros.clientes (id) ON DELETE SET NULL,
  -- Índice ciego del teléfono (mismo cálculo que conversaciones.wa_telefono_hash). Nunca el número.
  telefono_hash   text NOT NULL CHECK (telefono_hash ~ '^[0-9a-f]{16,128}$'),
  origen          text NOT NULL CHECK (origen IN ('recibo_devuelto', 'lead', 'recaptacion', 'solicitud_datos', 'presupuesto', 'renovacion', 'generico')),
  recibo_id       uuid REFERENCES seguros.poliza_recibos (id) ON DELETE SET NULL,
  oportunidad_id  uuid REFERENCES seguros.oportunidades (id) ON DELETE SET NULL,
  poliza_id       uuid REFERENCES seguros.polizas (id) ON DELETE SET NULL,
  solicitud_id    uuid,
  -- sha256 hex del texto NORMALIZADO (`hashTextoSaliente`). NULL = botón sin texto (genérico).
  texto_hash      text CHECK (texto_hash IS NULL OR texto_hash ~ '^[0-9a-f]{64}$'),
  abierto_at      timestamptz NOT NULL DEFAULT now(),
  abierto_por     text NOT NULL CHECK (length(abierto_por) BETWEEN 1 AND 120),
  -- El echo casado (mensajes.id). Al suprimir la conversación, el borrado lo quita también (y la FK lo anula).
  mensaje_id      uuid REFERENCES seguros.mensajes (id) ON DELETE SET NULL,
  casado_at       timestamptz,
  casado_tipo     text CHECK (casado_tipo IS NULL OR casado_tipo IN ('exacto', 'aproximado')),
  CONSTRAINT saliente_casado_coherente CHECK ((mensaje_id IS NULL) = (casado_tipo IS NULL)),
  CONSTRAINT saliente_generico_o_texto CHECK (origen = 'generico' OR texto_hash IS NOT NULL)
);

-- Candidatos al casar un echo: mismo teléfono, abiertos hace ≤24 h y sin casar.
CREATE INDEX IF NOT EXISTS idx_wa_salientes_telefono
  ON seguros.whatsapp_salientes_previstos (correduria_id, telefono_hash, abierto_at DESC) WHERE mensaje_id IS NULL;
-- El vinculado más reciente de un teléfono (contexto de la IA).
CREATE INDEX IF NOT EXISTS idx_wa_salientes_casados
  ON seguros.whatsapp_salientes_previstos (correduria_id, telefono_hash, casado_at DESC) WHERE mensaje_id IS NOT NULL;
-- Un echo casa con UN previsto como mucho.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_salientes_mensaje
  ON seguros.whatsapp_salientes_previstos (mensaje_id) WHERE mensaje_id IS NOT NULL;

COMMENT ON TABLE seguros.whatsapp_salientes_previstos IS
  'wa.me abiertos por el corredor en plataforma (origen y ancla en la cartera) para casar el echo de Coexistence. '
  'Sin texto ni número: sha256 del texto normalizado e índice ciego del teléfono.';

-- 2. Propuestas (botón ✅/❌ de Telegram, callback `wap_`) ─────────────────────────
CREATE TABLE IF NOT EXISTS seguros.whatsapp_propuestas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id        uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id           uuid NOT NULL REFERENCES seguros.clientes (id),
  conversacion_id      uuid REFERENCES seguros.conversaciones (id) ON DELETE SET NULL,
  tipo                 text NOT NULL CHECK (tipo IN ('fecha_cobro', 'pagado', 'vencimiento')),
  recibo_id            uuid REFERENCES seguros.poliza_recibos (id) ON DELETE SET NULL,
  oportunidad_id       uuid REFERENCES seguros.oportunidades (id) ON DELETE SET NULL,
  -- {fecha?: 'aaaa-mm-dd'} y nada más: sin texto del cliente ni datos personales.
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 2000),
  estado               text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aplicada', 'descartada', 'caducada')),
  creada_at            timestamptz NOT NULL DEFAULT now(),
  caduca_at            timestamptz NOT NULL DEFAULT now() + interval '7 days',
  resuelta_at          timestamptz,
  resuelta_por         text CHECK (resuelta_por IS NULL OR length(resuelta_por) <= 120),
  -- {tareaId?, error?, ...}: lo que hizo aplicarla (ids y códigos, sin valores).
  resultado            jsonb CHECK (resultado IS NULL OR (jsonb_typeof(resultado) = 'object' AND pg_column_size(resultado) <= 4000)),
  telegram_message_id  bigint,
  -- El ancla (recibo para fecha_cobro/pagado, oportunidad para vencimiento) la exige el CÓDIGO al crear, no un CHECK:
  -- con ON DELETE SET NULL, un CHECK impediría borrar un recibo con una propuesta pendiente. Sin ancla al aplicar → 409.
  CONSTRAINT propuesta_resuelta_coherente CHECK ((estado = 'pendiente') = (resuelta_at IS NULL))
);

-- Una sola pendiente por (tipo, ancla): la IA que repite lo mismo no apila botones.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_propuesta_pendiente
  ON seguros.whatsapp_propuestas (correduria_id, tipo, coalesce(recibo_id, oportunidad_id)) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_wa_propuestas_cliente ON seguros.whatsapp_propuestas (correduria_id, cliente_id, creada_at DESC);

COMMENT ON TABLE seguros.whatsapp_propuestas IS
  'Acciones que la IA de WhatsApp PROPONE (fecha prometida de cobro, ya pagado, vencimiento) y que solo aplica el botón '
  '✅ de Alberto en Telegram (callback wap_). Un solo uso; caduca a los 7 días. La IA nunca escribe recibos.';

-- 3. Fecha prometida de pago (D1) ──────────────────────────────────────────────────
ALTER TABLE seguros.poliza_recibos ADD COLUMN IF NOT EXISTS fecha_prometida_pago date;
COMMENT ON COLUMN seguros.poliza_recibos.fecha_prometida_pago IS
  'Fecha en que el cliente dice que pagará (WhatsApp, aplicada por Alberto con su botón). NULL = no consta. '
  'No cambia la situación del recibo: esa la manda CIMA/la compañía.';

-- 4. Media de los mensajes entrantes ───────────────────────────────────────────────
ALTER TABLE seguros.mensajes
  ADD COLUMN IF NOT EXISTS media_estado        text,
  ADD COLUMN IF NOT EXISTS media_documento_id  uuid REFERENCES seguros.documentos (id) ON DELETE SET NULL;
ALTER TABLE seguros.mensajes DROP CONSTRAINT IF EXISTS mensajes_media_estado_valido;
ALTER TABLE seguros.mensajes ADD CONSTRAINT mensajes_media_estado_valido
  CHECK (media_estado IS NULL OR media_estado IN ('pendiente', 'descargado', 'descartado', 'error'));
CREATE INDEX IF NOT EXISTS idx_mensajes_media_pendiente ON seguros.mensajes (enviado_at) WHERE media_estado = 'pendiente';

-- 5. Permisos (patrón de tarificador_pilotaje): RLS sin policies, nada público. La app no borra propuestas;
--    los salientes sí (supresión de la conversación, `borrarConversacion`).
ALTER TABLE seguros.whatsapp_salientes_previstos ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.whatsapp_propuestas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.whatsapp_salientes_previstos, seguros.whatsapp_propuestas FROM PUBLIC, anon, authenticated, crm_seguros;
GRANT SELECT, INSERT, UPDATE, DELETE ON seguros.whatsapp_salientes_previstos TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.whatsapp_propuestas TO prisma_seguros;
REVOKE DELETE ON seguros.whatsapp_propuestas FROM prisma_seguros;

COMMIT;

-- Comprobación tras aplicar:
--   select relname, relrowsecurity from pg_class where oid in ('seguros.whatsapp_salientes_previstos'::regclass, 'seguros.whatsapp_propuestas'::regclass);
--   select column_name from information_schema.columns where table_schema = 'seguros' and table_name = 'poliza_recibos' and column_name = 'fecha_prometida_pago';
--   select column_name from information_schema.columns where table_schema = 'seguros' and table_name = 'mensajes' and column_name like 'media_%';
