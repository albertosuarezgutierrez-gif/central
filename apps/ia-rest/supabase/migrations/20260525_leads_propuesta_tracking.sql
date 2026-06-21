-- Tracking de propuestas enviadas por Lead Hunter
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS propuesta_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS propuesta_url TEXT,
  ADD COLUMN IF NOT EXISTS propuesta_vista_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_propuesta_token ON leads(propuesta_token);
