-- Corrige el backfill del 06/08 (`2026-08-06_market_rates_corpus_clonado.sql`), que marcó como
-- clonadas TODAS las filas de los días 05 y 06/08 en vez de solo las del barrido.
--
-- El barrido (`mercado/sweep`) escribe con `scenario` = id de piso (`prop_*`); el scraper diario
-- (`mercado/cron`) y la búsqueda manual escriben `scenario` IN ('normal','corpus'). Ese scraper
-- barre UNA fecha por pasada, así que NO puede clonar nada entre fechas — es justo la fuente que
-- sí mide temporada y la que alimenta los buckets con comps limpios. Marcarlo fue quitarle al
-- motor 16 comparables buenos sin motivo.
--
-- Idempotente. La misma acotación va ya en el UPDATE del propio sweep, para que no se repita.
UPDATE market_rates
SET corpus_clonado = false
WHERE corpus_clonado
  AND scenario NOT LIKE 'prop\_%';
