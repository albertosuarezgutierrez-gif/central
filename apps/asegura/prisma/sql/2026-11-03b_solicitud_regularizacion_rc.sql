-- 2026-11-03b — Regularización de RC: PEDIR al cliente la facturación real del periodo por enlace (`/datos/<token>`,
-- motivo `regularizacion_rc`). Código: apps/asegura/lib/regularizacion-rc*.ts; reglas puras en
-- packages/module-seguros/src/regularizacion-rc.ts. SIN APLICAR: lo aplica Alberto.
--
-- Tabla PROPIA y no columnas en `solicitud_datos` (a propósito): aquella va atada a una OPORTUNIDAD (`oportunidad_id NOT
-- NULL`, «una viva por oportunidad y persona», historial de oportunidad, CHECK de ramos de presupuesto). Una regularización
-- cuelga de una PÓLIZA viva + PERIODO; meterla allí exigía relajar esos NOT NULL/índices y cada consulta vieja tendría que
-- acordarse de excluirla. Lo que se generaliza es el ENLACE: el mismo `/datos/<token>` del portal, que el puente resuelve
-- en una tabla u otra por el hash del token (`motivo` en la respuesta).
--
--  · `token_hash`: SHA-256 del token; NULL mientras es `borrador` (el token se crea al pulsar ✅ Enviar, nunca antes: ni
--    en Telegram ni en BD hay un enlace válido sin el OK de Alberto). Único.
--  · `borrador_asunto`/`borrador_texto`: el correo propuesto (lleva la marca {{ENLACE}}). `version` sube con cada ✏️: el
--    ✅ de un mensaje viejo de Telegram (callback con su versión) deja de valer.
--  · `respuesta`: CIFRADA (encryptField) — la facturación de un autónomo es dato económico personal. NULL salvo completada.
--  · Una viva por póliza + periodo (no anulada): un recordatorio de la compañía del mismo periodo no abre otra.
--
-- CÓDIGO ANTES QUE SQL: sin la tabla, el puerto `/api/operador/regularizacion-rc` contesta 503 `sin_migracion` y el
-- puente del portal sigue igual (un token que no está en `solicitud_datos` es «muerta», como hoy). Idempotente.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS seguros.solicitud_regularizacion (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id      uuid NOT NULL REFERENCES seguros.corredurias(id),
  poliza_id          uuid NOT NULL REFERENCES seguros.polizas(id),
  cliente_id         uuid NOT NULL REFERENCES seguros.clientes(id),
  compania           text NOT NULL,
  periodo_desde      text NOT NULL CHECK (periodo_desde ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  periodo_hasta      text NOT NULL CHECK (periodo_hasta ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  estado             text NOT NULL DEFAULT 'borrador'
                       CHECK (estado IN ('borrador', 'enviando', 'pendiente', 'completada', 'anulada')),
  version            int  NOT NULL DEFAULT 1,
  borrador_asunto    text,
  borrador_texto     text,
  token_hash         text UNIQUE,
  caduca_at          timestamptz,
  enviada_at         timestamptz,
  respuesta          text,
  documento_id       uuid REFERENCES seguros.documentos(id),
  completada_at      timestamptz,
  aviso_respuesta_at timestamptz,
  creada_por         text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solicitud_regularizacion_periodo CHECK (periodo_desde <= periodo_hasta),
  -- Sin OK de Alberto no hay token: borrador ⇔ sin token (anulada puede tener o no, según cuándo se anuló).
  CONSTRAINT solicitud_regularizacion_token CHECK (estado = 'anulada' OR (estado = 'borrador') = (token_hash IS NULL)),
  CONSTRAINT solicitud_regularizacion_completa
    CHECK ((estado = 'completada') = (respuesta IS NOT NULL AND completada_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS solicitud_regularizacion_una_viva
  ON seguros.solicitud_regularizacion (correduria_id, poliza_id, periodo_desde, periodo_hasta) WHERE estado <> 'anulada';
CREATE INDEX IF NOT EXISTS solicitud_regularizacion_poliza ON seguros.solicitud_regularizacion (correduria_id, poliza_id);

ALTER TABLE seguros.solicitud_regularizacion ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE seguros.solicitud_regularizacion IS
  'Regularización de RC (2026-11-03): petición de la facturación del periodo al cliente por enlace de un solo uso; nada sale sin ✅ de Alberto.';

-- Permisos (patrón de 2026-10-21): solo la app (`prisma_seguros`), sin DELETE. Ni el CRM de Manuel, ni el PORTAL (el
-- portal no lee esta tabla: llega por el puente de asegura con el token), ni anon/authenticated.
REVOKE ALL ON seguros.solicitud_regularizacion FROM PUBLIC, anon, authenticated, crm_seguros, prisma_asegura_portal;
GRANT SELECT, INSERT, UPDATE ON seguros.solicitud_regularizacion TO prisma_seguros;
REVOKE DELETE, TRUNCATE ON seguros.solicitud_regularizacion FROM prisma_seguros;

COMMIT;

-- Verificación tras aplicar:
--   select has_table_privilege('prisma_seguros', 'seguros.solicitud_regularizacion', 'DELETE');          -- f
--   select has_table_privilege('prisma_asegura_portal', 'seguros.solicitud_regularizacion', 'SELECT');   -- f
--   select has_table_privilege('crm_seguros', 'seguros.solicitud_regularizacion', 'SELECT');             -- f
