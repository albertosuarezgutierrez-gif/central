-- Agente de respuesta a huéspedes (SIVRA). Solo tablas nuevas (no toca ialimp).

-- Caché del contenido de la guía del huésped, por propiedad.
CREATE TABLE IF NOT EXISTS mensajes_guia_cache (
  property_id TEXT PRIMARY KEY,
  contenido   TEXT NOT NULL,
  fuente_url  TEXT,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log de cada mensaje procesado por el agente (métricas + graduación de autonomía).
CREATE TABLE IF NOT EXISTS mensajes_log (
  id           BIGSERIAL PRIMARY KEY,
  booking_id   TEXT NOT NULL,
  property_id  TEXT,
  categoria    TEXT,
  pregunta     TEXT,
  respuesta    TEXT,
  fuente       TEXT,                 -- guia | api | web | regla | ia
  confidence   NUMERIC,
  sentimiento  TEXT,                 -- positivo | neutro | negativo
  needs_human  BOOLEAN DEFAULT false,
  auto_sent    BOOLEAN DEFAULT false,
  edited       BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mensajes_log_cat ON mensajes_log (categoria, created_at);
CREATE INDEX IF NOT EXISTS idx_mensajes_log_booking ON mensajes_log (booking_id, created_at);

-- Correcciones de Alberto → ejemplos para el agente.
CREATE TABLE IF NOT EXISTS mensajes_aprendizaje (
  id              BIGSERIAL PRIMARY KEY,
  property_id     TEXT,
  categoria       TEXT,
  pregunta_norm   TEXT,
  respuesta_final TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aprendizaje_prop ON mensajes_aprendizaje (property_id, categoria);

-- Huecos de la guía (auto-mejora): preguntas que escalan por falta de info.
CREATE TABLE IF NOT EXISTS mensajes_guia_gaps (
  id           BIGSERIAL PRIMARY KEY,
  property_id  TEXT,
  pregunta     TEXT,
  veces        INTEGER NOT NULL DEFAULT 1,
  ultima_fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Config de autonomía por categoría (Fase 1 → Fase 2 sin redeploy).
CREATE TABLE IF NOT EXISTS mensajes_auto_config (
  categoria    TEXT PRIMARY KEY,
  auto_enabled BOOLEAN NOT NULL DEFAULT false,
  umbral       NUMERIC NOT NULL DEFAULT 0.85
);

-- Estado pendiente de propuestas Telegram (liga callback/force_reply a un booking).
CREATE TABLE IF NOT EXISTS mensajes_pendientes_tg (
  booking_id     TEXT PRIMARY KEY,
  property_id    TEXT,
  borrador       TEXT,
  categoria      TEXT,
  tg_message_id  BIGINT,
  esperando_edit BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
