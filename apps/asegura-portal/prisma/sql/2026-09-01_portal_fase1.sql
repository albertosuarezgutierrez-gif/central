-- Portal de Grupo ASegura — Fase 1. Schema `seguros` de la BD compartida.
-- Prefijo `portal_` para no colisionar con el volcado de la cartera.
SET search_path = seguros, public;

CREATE TYPE seguros.portal_canal_tipo AS ENUM ('whatsapp', 'email');
CREATE TYPE seguros.portal_procedencia AS ENUM ('compania', 'calculado', 'declarado');
CREATE TYPE seguros.portal_bien_tipo AS ENUM ('vehiculo', 'vivienda', 'local', 'mascota', 'persona', 'empresa');

-- Quien entra. NO es un cliente: puede no estar en la cartera.
CREATE TABLE seguros.portal_identidad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso_en timestamptz
);

-- Canal verificado. `valor_hash` para poder buscar sin guardar el valor en claro.
CREATE TABLE seguros.portal_canal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id  uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  tipo          seguros.portal_canal_tipo NOT NULL,
  valor_hash    text NOT NULL,
  verificado_en timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_portal_canal_tipo_valor ON seguros.portal_canal (tipo, valor_hash);
CREATE INDEX idx_portal_canal_identidad ON seguros.portal_canal (identidad_id);

-- Códigos de un solo uso. `usado_en` los hace de un solo uso de verdad.
CREATE TABLE seguros.portal_codigo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       seguros.portal_canal_tipo NOT NULL,
  valor_hash text NOT NULL,
  codigo     text NOT NULL,
  intentos   integer NOT NULL DEFAULT 0,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  usado_en   timestamptz
);
CREATE INDEX idx_portal_codigo_lookup ON seguros.portal_codigo (tipo, valor_hash, creado_en DESC);

-- La cosa asegurada. Es el ancla de todo lo demás (y, en Fase 3, del recordatorio).
CREATE TABLE seguros.portal_bien (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  tipo         seguros.portal_bien_tipo NOT NULL,
  nombre       text NOT NULL,
  datos        jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_bien_identidad ON seguros.portal_bien (identidad_id);

-- La póliza que APORTA el usuario. Puede no ser nuestra: ese es el punto.
CREATE TABLE seguros.portal_poliza_declarada (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id   uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  bien_id        uuid REFERENCES seguros.portal_bien(id) ON DELETE SET NULL,
  compania       text,
  numero_poliza  text,
  ramo           text,
  prima_anual    numeric(10,2),
  fecha_vencimiento date,
  procedencia    seguros.portal_procedencia NOT NULL DEFAULT 'declarado',
  confirmada_por_usuario boolean NOT NULL DEFAULT false,
  documento_nombre text,
  extraccion_bruta jsonb,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_poliza_identidad ON seguros.portal_poliza_declarada (identidad_id);
CREATE INDEX idx_portal_poliza_vencimiento ON seguros.portal_poliza_declarada (fecha_vencimiento)
  WHERE fecha_vencimiento IS NOT NULL;

-- Consentimiento. APPEND-ONLY: se añaden filas, nunca se actualizan.
-- Separa «avísame» de «ofertadme» a propósito: un portal gratis que usa el alta
-- como permiso comercial se muere en tres meses.
CREATE TABLE seguros.portal_consentimiento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('avisos', 'comercial', 'lds_art19')),
  otorgado     boolean NOT NULL,
  version_texto text NOT NULL,
  ip           inet,
  user_agent   text,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_consentimiento_identidad ON seguros.portal_consentimiento (identidad_id, tipo, creado_en DESC);
