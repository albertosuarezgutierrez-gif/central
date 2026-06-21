-- Módulo de prospección en frío de IALIMP (panel superadmin).
-- Capta empresas de limpieza como nuevos clientes del SaaS: un agente manda
-- correos de presentación automáticamente, con tracking de aperturas/clicks,
-- baja funcional y aviso a Alberto cuando un prospecto pincha el enlace.
--
-- Responsable del tratamiento = Alberto Suárez / IALIMP (lib/rgpd.ts).
-- Es GLOBAL de IALIMP, NO multi-tenant → las tablas NO llevan empresa_id.

-- ── Prospectos (la lista importada por CSV + los que llegan por la landing) ──
CREATE TABLE IF NOT EXISTS mailing_prospectos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_nombre text NOT NULL,
  email         text NOT NULL,
  telefono      text,
  ciudad        text DEFAULT 'Sevilla',
  web           text,
  notas         text,
  -- Estado de seguimiento comercial. Avanza solo (enviado→abierto→click) y
  -- Alberto lo edita a mano al llamar (contactado/interesado/descartado).
  estado        text NOT NULL DEFAULT 'nuevo',
                -- nuevo|enviado|abierto|click|contactado|interesado|descartado|rebotado
  baja          boolean NOT NULL DEFAULT false,  -- supresión global (unsubscribe / rebote)
  baja_at       timestamptz,
  baja_motivo   text,
  ia_opener     text,            -- línea personalizada por IA (cacheada, reutilizada en cada paso)
  seguimiento_proximo_at timestamptz,  -- recordatorio de la próxima llamada
  origen        text DEFAULT 'csv',    -- csv | landing
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Idempotencia del import: email único (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS ux_mailing_prospectos_email
  ON mailing_prospectos (lower(email));

-- ── Campañas (en la práctica habrá UNA campaña de presentación activa) ──
CREATE TABLE IF NOT EXISTS mailing_campanas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text NOT NULL,
  activa        boolean NOT NULL DEFAULT false,  -- el agente envía mientras esté activa
  estado        text NOT NULL DEFAULT 'borrador',-- borrador|activa|pausada|finalizada
  landing_url   text DEFAULT 'https://ialimp.es',
  max_dia       int  NOT NULL DEFAULT 50,        -- tope de envíos/día (warm-up)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Pasos de la secuencia (drip): paso 1 = presentación; 2-3 = recordatorios ──
CREATE TABLE IF NOT EXISTS mailing_pasos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id    uuid NOT NULL REFERENCES mailing_campanas(id) ON DELETE CASCADE,
  orden         int  NOT NULL,           -- 1, 2, 3...
  dias_espera   int  NOT NULL DEFAULT 0, -- días tras el paso previo sin abrir/pinchar
  asunto        text NOT NULL,
  cuerpo_html   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mailing_pasos_orden
  ON mailing_pasos (campana_id, orden);

-- ── Cola de envíos: una fila por (campaña, prospecto, paso). El agente la vacía ──
CREATE TABLE IF NOT EXISTS mailing_envios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id    uuid NOT NULL REFERENCES mailing_campanas(id) ON DELETE CASCADE,
  prospecto_id  uuid NOT NULL REFERENCES mailing_prospectos(id) ON DELETE CASCADE,
  paso          int  NOT NULL DEFAULT 1,
  token         text NOT NULL,                     -- genHex(16); pixel/click/baja
  estado        text NOT NULL DEFAULT 'pendiente', -- pendiente|enviado|fallido|omitido
  intentos      int  NOT NULL DEFAULT 0,
  error         text,
  enviado_at    timestamptz,
  abierto_at    timestamptz,   -- primera apertura
  click_at      timestamptz,   -- primer click
  aperturas     int  NOT NULL DEFAULT 0,
  clicks        int  NOT NULL DEFAULT 0,
  avisado_at    timestamptz,   -- cuándo se avisó a Alberto del click (para no repetir)
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Idempotencia de cola: un envío por (campaña, prospecto, paso).
CREATE UNIQUE INDEX IF NOT EXISTS ux_mailing_envios_campana_prospecto_paso
  ON mailing_envios (campana_id, prospecto_id, paso);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mailing_envios_token
  ON mailing_envios (token);
-- El agente saca pendientes rápido.
CREATE INDEX IF NOT EXISTS ix_mailing_envios_pendientes
  ON mailing_envios (campana_id, estado) WHERE estado = 'pendiente';

-- ── Log inmutable de eventos (auditoría + métricas detalladas) ──
CREATE TABLE IF NOT EXISTS mailing_eventos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id    uuid NOT NULL REFERENCES mailing_envios(id) ON DELETE CASCADE,
  tipo        text NOT NULL,  -- enviado|apertura|click|click_whatsapp|baja|rebote|queja
  url         text,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_mailing_eventos_envio ON mailing_eventos (envio_id);
