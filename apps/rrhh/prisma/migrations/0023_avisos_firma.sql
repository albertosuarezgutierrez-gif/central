-- Avisos al empleado + seguimiento de firmas pendientes (20/10/2026). PENDIENTE de aplicar.
-- Aditiva e idempotente. 🚨 Aplicar ANTES de desplegar el código: `listarExpediente` lee las
-- columnas nuevas de `rrhh.documentos` y sin ellas el expediente (admin y /e) da 500.
--
-- 1) Metadatos del documento que propone la IA de subida (y confirma el responsable) y fechas de
--    seguimiento. Todas NULL-ables: NULL = «no se sabe» (documentos anteriores a esta migración),
--    nunca «no hay».
ALTER TABLE rrhh.documentos
  ADD COLUMN IF NOT EXISTS categoria_doc       text,         -- catálogo cerrado (lib/asistente-subida.ts)
  ADD COLUMN IF NOT EXISTS resumen             text,         -- resumen breve para el empleado
  ADD COLUMN IF NOT EXISTS envio_id            uuid,         -- uuid del CLIENTE por documento: agrupa las copias e idempotencia
  ADD COLUMN IF NOT EXISTS avisar              boolean,      -- «Avisar al empleado» del envío; NULL = anterior a 0023 (se avisa)
  ADD COLUMN IF NOT EXISTS firma_solicitada_at timestamptz,  -- desde cuándo se le reclama la firma
  ADD COLUMN IF NOT EXISTS visto_empleado_at   timestamptz;  -- primera vez que el empleado lo abrió

ALTER TABLE rrhh.documentos DROP CONSTRAINT IF EXISTS documentos_categoria_doc_chk;
ALTER TABLE rrhh.documentos ADD CONSTRAINT documentos_categoria_doc_chk CHECK (
  categoria_doc IS NULL OR categoria_doc IN
  ('contrato','anexo','nomina','prl_formacion','protocolo_politica','sancion','vacaciones','certificado','otro'));

CREATE INDEX IF NOT EXISTS documentos_pendientes_idx
  ON rrhh.documentos (empresa_id, estado_firma) WHERE estado_firma IN ('pendiente', 'pendiente_empresa');
-- Idempotencia del envío: UNA copia por (envio_id, empleado). Un reintento (timeout, doble clic,
-- «Enviar todo» sobre lo ya enviado) no duplica: `asignarStaging` salta las existentes y el INSERT
-- lleva ON CONFLICT … DO NOTHING. También sirve de índice para buscar las copias de un envío.
CREATE UNIQUE INDEX IF NOT EXISTS documentos_envio_empleado_uq
  ON rrhh.documentos (envio_id, empleado_id) WHERE envio_id IS NOT NULL;

-- 2) Avisos al empleado (intranet + email + push). Una fila por aviso; el resultado de cada canal
--    queda registrado. `email_estado`/`push_estado` NULL = aún no intentado (no «falló»).
CREATE TABLE IF NOT EXISTS rrhh.avisos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id   uuid NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  documento_id  uuid REFERENCES rrhh.documentos(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('solicitud_firma','recordatorio_firma','reclamacion_firma','documento_nuevo')),
  titulo        text NOT NULL,
  cuerpo        text,
  creado_por    text NOT NULL,                       -- usuario_id del responsable o 'cron'
  creado_at     timestamptz NOT NULL DEFAULT now(),
  -- Día (hora de Madrid) del aviso: la clave de idempotencia del recordatorio automático.
  fecha_local   date NOT NULL DEFAULT ((now() AT TIME ZONE 'Europe/Madrid')::date),
  email_estado  text CHECK (email_estado IN ('enviado','sin_email','sin_transporte','error')),
  email_error   text,
  email_at      timestamptz,
  push_estado   text CHECK (push_estado IN ('enviado','sin_suscripcion','sin_vapid','error')),
  push_at       timestamptz,
  visto_en      timestamptz
);
CREATE INDEX IF NOT EXISTS avisos_empleado_idx  ON rrhh.avisos (empresa_id, empleado_id, creado_at DESC);
CREATE INDEX IF NOT EXISTS avisos_documento_idx ON rrhh.avisos (documento_id, creado_at DESC);
-- Idempotencia del cron: como mucho UN recordatorio automático por documento y día. El INSERT
-- reserva la fila (ON CONFLICT DO NOTHING) ANTES de enviar: dos ejecuciones no envían dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS avisos_recordatorio_dia_uq
  ON rrhh.avisos (documento_id, fecha_local) WHERE tipo = 'recordatorio_firma';

-- Igual que el resto del schema: RLS on, el backend entra con rrhh_app (BYPASSRLS).
ALTER TABLE rrhh.avisos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.avisos TO rrhh_app;
