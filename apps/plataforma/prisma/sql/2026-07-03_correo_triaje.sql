-- 2026-07-03_correo_triaje.sql — Agente de triaje de correo (skill `correo-triaje`).
-- Buzón personal único de Alberto (sin cuenta_id, mismo criterio que facturas_drive).
-- Estado idempotente + observable: cada correo triado deja una fila; el cursor IMAP
-- persiste el último UID por buzón; correo_reglas fija decisiones (semilla + auto-aprendizaje).
-- Aplicar a la BD compartida wswbehlcuxqxyinousql (raw SQL vía Prisma, sin RLS de la app).

-- 1) Registro de cada correo triado (dedupe por Message-ID, fuente del digest, heartbeat auditoría).
CREATE TABLE IF NOT EXISTS correo_triaje (
  id                BIGSERIAL PRIMARY KEY,
  gmail_message_id  TEXT NOT NULL UNIQUE,          -- header Message-ID (dedupe robusto entre pasadas)
  uid               INTEGER NOT NULL,               -- UID IMAP dentro del buzón (INBOX)
  remitente         TEXT NOT NULL DEFAULT '',
  asunto            TEXT NOT NULL DEFAULT '',
  fecha             TIMESTAMPTZ,                    -- fecha del correo
  categoria         TEXT NOT NULL,                  -- ver lib/correo/rutas.ts
  confianza         NUMERIC(3,2),                   -- 0.00–1.00 (null si vino de regla/skip)
  via               TEXT NOT NULL DEFAULT 'ia',     -- 'regla' | 'ia' | 'skip'
  accion            TEXT NOT NULL DEFAULT 'ninguna',-- 'etiquetada' | 'etiquetada_archivada' | 'ninguna' | 'error' | 'sombra'
  resumen           TEXT,                           -- resumen de 1 línea (IA)
  accion_sugerida   TEXT,                           -- qué debe hacer Alberto (mejora 2)
  fecha_limite      TIMESTAMPTZ,                    -- deadline detectado (mejora 2)
  notificado        BOOLEAN NOT NULL DEFAULT false, -- ¿se envió aviso inmediato por Telegram?
  digest_at         TIMESTAMPTZ,                    -- cuándo entró en un digest diario
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Índice parcial para el digest: filas aún no incluidas en ningún digest.
CREATE INDEX IF NOT EXISTS correo_triaje_digest_idx
  ON correo_triaje (created_at) WHERE digest_at IS NULL;

-- 2) Cursor incremental IMAP: último UID procesado por buzón (+ uidvalidity para detectar resets).
CREATE TABLE IF NOT EXISTS correo_cursor (
  buzon        TEXT PRIMARY KEY,                    -- 'INBOX'
  last_uid     INTEGER NOT NULL DEFAULT 0,
  uidvalidity  BIGINT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Reglas de remitente → categoría forzada (análogo a banca_destino_reglas / correduria_reglas).
--    El clasificador las consulta ANTES de llamar a la IA (0 tokens + fija decisiones de Alberto).
CREATE TABLE IF NOT EXISTS correo_reglas (
  id          BIGSERIAL PRIMARY KEY,
  patron      TEXT NOT NULL UNIQUE,                 -- email exacto ('x@y.com') o dominio ('@y.com')
  categoria   TEXT NOT NULL,
  creado_por  TEXT NOT NULL DEFAULT 'alberto',      -- 'alberto' | 'auto' (auto-aprendizaje, mejora 4)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Semilla VIP día 1 (mejora 4): remitentes conocidos del buzón real de Alberto.
-- Fija la decisión sin gastar IA; el auto-aprendizaje irá añadiendo más con creado_por='auto'.
INSERT INTO correo_reglas (patron, categoria, creado_por) VALUES
  ('pilar.pina.franco@gmail.com', 'personal-importante', 'alberto'),
  ('@clickedu.eu',                'personal-importante', 'alberto'),  -- colegio de los niños
  ('@workandlife.com',            'personal-importante', 'alberto'),  -- guardería / escuela infantil
  ('@vivodiagnostico.com',        'personal-importante', 'alberto'),  -- citas de salud
  ('@midiagnostico.es',           'personal-importante', 'alberto'),
  ('@bbva.com',                   'personal-importante', 'alberto'),  -- banca con acción (firmas, avisos)
  ('@kutxabank.es',               'personal-importante', 'alberto'),
  ('@guest.booking.com',          'huespedes',           'alberto'),  -- mensajes de huéspedes (pisos)
  ('@info.homeexchange.com',      'huespedes',           'alberto'),
  ('@occidentinforma.com',        'correduria',          'alberto'),  -- regularizaciones RC correduría
  ('@notifications.github.com',   'ruido',               'alberto')   -- fallback si el filtro Gmail no lo cazó
ON CONFLICT (patron) DO NOTHING;
