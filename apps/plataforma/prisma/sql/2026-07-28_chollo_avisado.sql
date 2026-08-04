-- Chollos de venta directa — 28/07/2026
-- Cada anuncio avisa por Telegram UNA vez en su vida como chollo. La mediana de
-- zona se mueve a diario y sin este sello un anuncio que entra y sale del
-- umbral re-avisaría cada mañana.
ALTER TABLE public.mercado_comparables
  ADD COLUMN IF NOT EXISTS chollo_avisado_at timestamptz;
