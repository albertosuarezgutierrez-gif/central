-- ============================================================
-- Migración: CRM leads completo + propuesta dinámica
-- Fecha: 2026-05-23
-- ============================================================

-- 1. Ampliar tabla leads con campos de estudio y pipeline
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS empresa TEXT,
  ADD COLUMN IF NOT EXISTS web TEXT,
  ADD COLUMN IF NOT EXISTS ciudad TEXT DEFAULT 'Sevilla',
  ADD COLUMN IF NOT EXISTS estudio_completo JSONB,
  ADD COLUMN IF NOT EXISTS pain_points TEXT[],
  ADD COLUMN IF NOT EXISTS modulos_recomendados TEXT[],
  ADD COLUMN IF NOT EXISTS mrr_estimado DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS propuesta_slug TEXT,
  ADD COLUMN IF NOT EXISTS email_draft TEXT,
  ADD COLUMN IF NOT EXISTS email_asunto TEXT,
  ADD COLUMN IF NOT EXISTS estado_pipeline TEXT DEFAULT 'nuevo',
  ADD COLUMN IF NOT EXISTS research_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS propuesta_enviada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS propuesta_vista_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reunion_fecha TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reunion_lugar TEXT,
  ADD COLUMN IF NOT EXISTS reunion_notas TEXT,
  ADD COLUMN IF NOT EXISTS reunion_confirmada BOOLEAN DEFAULT false;

-- 2. Índice único para slug de propuesta
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_propuesta_slug
  ON leads(propuesta_slug)
  WHERE propuesta_slug IS NOT NULL;

-- 3. Índice para pipeline
CREATE INDEX IF NOT EXISTS idx_leads_estado_pipeline
  ON leads(estado_pipeline);

-- 4. Sincronizar campo empresa desde restaurante (para leads existentes)
UPDATE leads SET empresa = restaurante WHERE empresa IS NULL AND restaurante IS NOT NULL;
