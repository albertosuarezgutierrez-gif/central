-- market_rates.corpus_clonado — APLICADA en producción el 06/08/2026.
--
-- 🚨 Por qué. El barrido de mercado (`mercado/sweep`) llegó a cubrir el calendario entero, pero
-- sus comps NO distinguen la fecha: medido ese día, 117 ventanas con datos compartían solo 22
-- medianas distintas (305€ en 21 ventanas, 204€ en 18, 258€ en 15…) y el 93% se repetían en otra
-- fecha. Son los snippets de Google devolviendo el mismo puñado de anuncios genéricos de Sevilla
-- para cualquier fecha que se le pida.
--
-- El latido ya lo canta (`corpusClonado` en lib/sivra/resumen-sweep.ts), pero eso avisa a un
-- HUMANO: no frena al motor, que seguía metiendo esas 339 filas en el bucket de temporada y
-- tarificando con una estacionalidad inventada. Esta columna es el freno: el sweep marca su
-- propia pasada cuando la guardia salta, y `pricing/apply` excluye lo marcado.
--
-- DEFAULT false a propósito: las filas históricas quedan como estaban (statu quo), y solo se
-- marca lo que se ha medido como clonado.
ALTER TABLE market_rates ADD COLUMN IF NOT EXISTS corpus_clonado boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS market_rates_corpus_clonado_idx
  ON market_rates (search_date) WHERE corpus_clonado;

-- Backfill de las dos pasadas ya medidas como clonadas.
UPDATE market_rates SET corpus_clonado = true
WHERE search_date IN (DATE '2026-08-05', DATE '2026-08-06');
