-- ══════════════════════════════════════════════════════════════════════
-- VINOS CATÁLOGO GLOBAL — ia.rest  (18/05/2026)
-- Catálogo compartido entre todos los restaurantes.
-- Un vino se enriquece con IA una sola vez → caché para todos.
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vinos_catalogo (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identificación del vino
  nombre              TEXT        NOT NULL,
  bodega              TEXT,
  tipo                TEXT,          -- tinto | blanco | rosado | espumoso | generoso
  denominacion_origen TEXT,
  varietal            TEXT,

  -- Enriquecimiento IA
  descripcion_cata    TEXT,          -- 2 frases: aromas + boca
  maridaje_tags       TEXT[]  DEFAULT '{}',
  maridaje_texto      TEXT,          -- "Carnes rojas, caza mayor"
  temperatura_servicio TEXT,         -- "16-18°C"

  -- Tracking
  fuente              TEXT    DEFAULT 'ia',  -- 'ia' | 'manual'
  consultas           INT     DEFAULT 1,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Normalizado para deduplicar (lower + trim)
  nombre_norm         TEXT    GENERATED ALWAYS AS (LOWER(TRIM(nombre))) STORED,
  bodega_norm         TEXT    GENERATED ALWAYS AS (LOWER(TRIM(COALESCE(bodega, '')))) STORED
);

-- Índice único: mismo vino de misma bodega = misma entrada
CREATE UNIQUE INDEX IF NOT EXISTS idx_vinos_catalogo_norm
  ON vinos_catalogo (nombre_norm, bodega_norm);

-- Índices para filtrar rápido
CREATE INDEX IF NOT EXISTS idx_vinos_catalogo_tipo ON vinos_catalogo (tipo);
CREATE INDEX IF NOT EXISTS idx_vinos_catalogo_tags ON vinos_catalogo USING GIN (maridaje_tags);

-- RLS
ALTER TABLE vinos_catalogo ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer el catálogo global
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vinos_catalogo' AND policyname = 'vinos_catalogo_read'
  ) THEN
    CREATE POLICY "vinos_catalogo_read" ON vinos_catalogo
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Solo service_role puede escribir (desde API routes del servidor)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vinos_catalogo' AND policyname = 'vinos_catalogo_service_write'
  ) THEN
    CREATE POLICY "vinos_catalogo_service_write" ON vinos_catalogo
      FOR ALL TO service_role USING (true);
  END IF;
END $$;

COMMENT ON TABLE vinos_catalogo IS
  'Catálogo global de vinos con enriquecimiento IA. Compartido entre todos los restaurantes. La consulta a Claude se hace una sola vez por vino (caché).';
