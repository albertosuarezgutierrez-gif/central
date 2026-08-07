-- market_rates.fuente — DE DÓNDE salió cada comparable, y por qué hace falta saberlo.
--
-- POR QUÉ (06/08/2026). El corpus por piso (`scenario LIKE 'prop_%'`) lo escriben hoy TRES
-- caminos distintos y los tres ponen `portal='booking'`, así que son indistinguibles:
--   · el barrido de Serper (`/api/sivra/mercado/sweep`) — precios de anuncio SIN señal de fecha:
--     medido ese día, Vincci salía a 305€ igual en agosto, en noviembre y en marzo;
--   · la ingesta por conector (`/api/sivra/mercado/ingest`) — precio REAL de la fecha pedida;
--   · lo que se metió a mano en su día (la Bienal del 03/08).
-- El motor (`pricing/apply`) NO filtra por portal: mezcla los tres en el mismo percentil. Sin una
-- marca de procedencia no se puede (a) medir qué cobertura es fiable, (b) retirar una fuente sin
-- adivinar por heurística de fechas, ni (c) explicar de dónde viene un precio.
--
-- Los valores son deliberadamente pocos y estables:
--   'serper'      → scraping de resultados de búsqueda (precio de anuncio, sin fecha fiable)
--   'booking_mcp' → conector de Booking por fecha y aforo reales (fuente de temporada)
--   'manual'      → cargado a mano en una sesión
-- El DEFAULT es 'serper' a propósito: todo lo que había ANTES de esta columna venía de ahí (o se
-- cargó a mano imitándolo), así que 'serper' es la lectura conservadora — nunca marca como fiable
-- algo que no se ha comprobado.

ALTER TABLE market_rates
  ADD COLUMN IF NOT EXISTS fuente TEXT NOT NULL DEFAULT 'serper';

-- Consulta de cobertura del plan de barrido: «¿cuándo se midió por última vez esta fecha × aforo
-- con una fuente fiable?». Va por (checkin_date, guests) y por eso el índice los lleva delante.
CREATE INDEX IF NOT EXISTS idx_market_rates_fuente_cobertura
  ON market_rates (fuente, checkin_date, guests, search_date DESC);
