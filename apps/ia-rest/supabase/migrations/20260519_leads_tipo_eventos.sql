-- Ampliar tabla leads: tipo (online/personal), campos extra, historial eventos

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tipo      text NOT NULL DEFAULT 'online' CHECK (tipo IN ('online','personal')),
  ADD COLUMN IF NOT EXISTS email     text,
  ADD COLUMN IF NOT EXISTS locales   text,
  ADD COLUMN IF NOT EXISTS tpv       text,
  ADD COLUMN IF NOT EXISTS contacto  text,
  ADD COLUMN IF NOT EXISTS eventos   jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Índice para búsquedas por tipo
CREATE INDEX IF NOT EXISTS leads_tipo_idx ON leads(tipo);
