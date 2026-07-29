-- Seguimiento de BAJADAS DE PRECIO en los comparables — 28/07/2026
--
-- POR QUÉ: un anuncio que baja de precio (y más si baja varias veces) es un
-- vendedor nervioso: es el candidato natural a una oferta a la baja. El mismo
-- anuncio llega en correos sucesivos mientras sigue vivo, así que la bajada se
-- detecta comparando el precio nuevo contra el guardado en el upsert — sin
-- depender de que Idealista mande su correo específico de "bajada de precio".
--
-- `precio_inicial` = el primer precio que le vimos (para el descuento acumulado).
-- `bajada_avisada_n` = hasta qué nº de bajada se ha avisado ya por Telegram
-- (mismo patrón anti-re-aviso que `chollo_avisado_at`).
ALTER TABLE public.mercado_comparables
  ADD COLUMN IF NOT EXISTS precio_inicial numeric,
  ADD COLUMN IF NOT EXISTS precio_anterior numeric,
  ADD COLUMN IF NOT EXISTS bajadas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_bajada_at timestamptz,
  ADD COLUMN IF NOT EXISTS bajada_avisada_n int NOT NULL DEFAULT 0;

-- Backfill: a lo ya ingerido, su precio actual es lo más antiguo que conocemos.
UPDATE public.mercado_comparables SET precio_inicial = precio WHERE precio_inicial IS NULL;
