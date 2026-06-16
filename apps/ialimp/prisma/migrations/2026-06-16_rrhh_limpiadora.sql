-- RR.HH. de la limpiadora (Fase 1): expediente documental + nómina PDF + firma avanzada (OTP).
-- Espejo de las tablas `rrhh.documentos/firmas/firma_otps`, scopeadas por (empresa_id, limpiadora_id).
-- La orquestación de firma vive en @central/module-rrhh; aquí solo la persistencia de ialimp.

-- Email (OBLIGATORIO para el OTP de firma) + DNI de la limpiadora.
ALTER TABLE limpiadoras ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE limpiadoras ADD COLUMN IF NOT EXISTS dni   text;

-- Expediente: documentos de la limpiadora (nóminas, contratos, etc.).
CREATE TABLE IF NOT EXISTS documentos_limpiadora (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  limpiadora_id uuid NOT NULL,
  carpeta       text NOT NULL,
  nombre        text NOT NULL,
  tipo          text,
  tamano        bigint,
  storage_path  text NOT NULL,
  subido_por    text NOT NULL DEFAULT 'gestor',   -- 'gestor' | 'titular'
  caducidad     date,
  estado_firma  text NOT NULL DEFAULT 'sin_firma', -- 'sin_firma' | 'pendiente' | 'firmado'
  creada_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_limp_limpiadora ON documentos_limpiadora(limpiadora_id);
CREATE INDEX IF NOT EXISTS idx_doc_limp_empresa    ON documentos_limpiadora(empresa_id);

-- Evidencia de firma avanzada (eIDAS art.26) de cada documento firmado.
CREATE TABLE IF NOT EXISTS firmas_limpiadora (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  limpiadora_id   uuid NOT NULL,
  documento_id    uuid NOT NULL,
  doc_hash        text NOT NULL,
  algoritmo       text NOT NULL,
  metodo          text NOT NULL,        -- 'otp_email' | 'sesion_token'
  firmante_nombre text,
  firmante_email  text,
  firmante_dni    text,
  ip              text,
  user_agent      text,
  sello_tiempo    timestamptz NOT NULL,
  evidencia       jsonb NOT NULL,
  creada_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_firmas_limp_doc ON firmas_limpiadora(documento_id);

-- OTP de firma: un código vigente por (documento, limpiadora).
CREATE TABLE IF NOT EXISTS firma_otps_limpiadora (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL,
  limpiadora_id uuid NOT NULL,
  documento_id  uuid NOT NULL,
  codigo_hash   text NOT NULL,
  expira_at     timestamptz NOT NULL,
  intentos      int NOT NULL DEFAULT 0,
  creada_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, limpiadora_id)
);
