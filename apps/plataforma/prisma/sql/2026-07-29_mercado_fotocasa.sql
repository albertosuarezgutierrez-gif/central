-- Fotocasa como segunda fuente de comparables (29/07/2026).
-- El anunciante sale de la FICHA del anuncio (no del correo):
--   anunciante NULL + es_particular=true  → 👤 particular (negociación directa)
--   anunciante_visto_at                   → cada ficha se consulta UNA vez
ALTER TABLE mercado_comparables
  ADD COLUMN IF NOT EXISTS anunciante text,
  ADD COLUMN IF NOT EXISTS es_particular boolean,
  ADD COLUMN IF NOT EXISTS anunciante_visto_at timestamptz;
