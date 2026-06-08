-- Marca por empresa (white-label "una sola URL según login").
-- Columnas aditivas con DEFAULT = ialimp → las empresas existentes no cambian
-- hasta que configuren su marca en el panel.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS marca_nombre     text,
  ADD COLUMN IF NOT EXISTS logo_url         text,
  ADD COLUMN IF NOT EXISTS color_primario   text NOT NULL DEFAULT '#4f46e5',
  ADD COLUMN IF NOT EXISTS color_secundario text NOT NULL DEFAULT '#6366f1',
  ADD COLUMN IF NOT EXISTS color_light      text NOT NULL DEFAULT '#eef2ff';
