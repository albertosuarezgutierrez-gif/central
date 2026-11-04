-- 2026-11-04 · Borradores de Instagram de Grupo ASegura (correduría).
--
-- Por qué: el cron `/api/cron/asegura-instagram` (L/X/V) genera una pieza (imagen + caption), la pasa
-- por el cepo de copy (`revisarCopy`, RDL 3/2020) y la manda a Telegram con ✅/🗑️/🔄 (`asig_*`). Nada
-- se publica sin el botón de Alberto. Esta tabla guarda cada pieza y lo que le pasó.
-- Lógica pura: `lib/correduria/instagram-asegura.ts`; BD: `lib/correduria/instagram-asegura-db.ts`.
--
-- Estados:
--   pendiente        → esperando el botón de Alberto.
--   publicando       → transitorio: se pulsó ✅ y hay llamada a la Graph API en curso (evita doble post).
--   aprobado_manual  → ✅ sin perfil de Instagram (faltan ASEGURA_INSTAGRAM_*): se le dio imagen + caption.
--   publicado        → publicado por Graph API (`ig_post_id`).
--   descartado       → 🗑️, 🔄 (sustituido por otro) o caducado sin decidir.
--   rechazado_copy   → el cepo lo paró dos veces: NO se envió a Telegram con botones; `motivo` dice por qué.
--
-- `cuenta_id`: la cuenta del libro de la correduría (`cuentaDelLibro()`, `CORREDURIA_EMAILS`), igual que
-- `comisiones_liquidacion_docs`. Sin datos personales de clientes.
-- Aditivo e idempotente. Aplicar por Supabase MCP en la BD compartida (wswbehlcuxqxyinousql) con OK.
-- Sin esta tabla: el cron responde 503 y avisa; la imagen pública da 404.

CREATE TABLE IF NOT EXISTS asegura_instagram_borradores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        UUID NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  estado           TEXT NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'publicando', 'aprobado_manual', 'publicado', 'descartado', 'rechazado_copy')),
  plantilla        TEXT NOT NULL CHECK (plantilla IN ('pregunta', 'claves', 'mito')),
  tema             TEXT NOT NULL CHECK (tema IN ('comunidades', 'comercio', 'flota', 'hogar', 'renovacion', 'marca')),
  -- Texto que se PINTA en la imagen. En `rechazado_copy` puede quedar vacío (respuesta ilegible).
  titulo           TEXT NOT NULL DEFAULT '',
  sub              TEXT NOT NULL DEFAULT '',
  puntos           JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Caption FINAL (con el pie del mediador), tal cual se publica.
  caption          TEXT NOT NULL DEFAULT '',
  -- URL pública de la imagen (`/api/publico/asegura-ig/<id>`). NULL en `rechazado_copy`.
  image_url        TEXT,
  -- Reparos del cepo (rechazado_copy) o último error al publicar. NULL = nada que contar.
  motivo           TEXT,
  intentos         SMALLINT NOT NULL DEFAULT 1,
  telegram_msg_id  BIGINT,
  ig_post_id       TEXT,
  creado_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decidido_at      TIMESTAMPTZ,
  publicado_at     TIMESTAMPTZ,
  CHECK (estado <> 'publicado' OR ig_post_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_asegura_ig_borradores_cuenta_creado
  ON asegura_instagram_borradores (cuenta_id, creado_at DESC);

ALTER TABLE asegura_instagram_borradores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON asegura_instagram_borradores FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON asegura_instagram_borradores TO prisma_plataforma;

COMMENT ON TABLE asegura_instagram_borradores IS
  'Borradores de Instagram de Grupo ASegura: pieza generada, revisada por revisarCopy y aprobada (o no) por Alberto desde Telegram (asig_*).';

-- Verificación (a mano, tras aplicar):
--   SELECT has_table_privilege('prisma_plataforma','asegura_instagram_borradores','INSERT');  -- true
--   SELECT has_table_privilege('anon','asegura_instagram_borradores','SELECT');               -- false
--   SELECT count(*) FROM asegura_instagram_borradores;                                        -- 0
