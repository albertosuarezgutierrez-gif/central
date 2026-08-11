-- Saneo de valores IMPOSIBLES en la caché trading_universo (11/08/2026).
-- Contexto: RDY (ADR indio, resultados en rupias vs capitalización en dólares) llevaba
-- earnings_yield=6.82 (682%) y fcf_yield=5.01 desde el 23/07 y salió nº 1 del explorador de
-- /trading con score 6,03 — la página leía la caché CRUDA sin el guardián lib/trading/calidad-datos.ts
-- (el cron del radar sí lo aplicaba). El fix de código aplica el guardián también en la página;
-- este backfill limpia las filas legado para que NINGÚN lector (SQL incluido) trague el veneno.
-- Umbrales = LIMITES de lib/trading/calidad-datos.ts (lo IMPOSIBLE, no lo raro). Idempotente.
-- Afectadas el 11/08/2026: RDY (ey+fcf), BMNR (ey; su mkt_cap 423M$ se conserva — puede ser real
-- de small-cap, el ranking ya la etiqueta), VRSN (roic −15.569%, capital invertido ≈0).

UPDATE trading_universo SET earnings_yield = NULL
WHERE earnings_yield IS NOT NULL AND abs(earnings_yield) > 1;

UPDATE trading_universo SET fcf_yield = NULL
WHERE fcf_yield IS NOT NULL AND abs(fcf_yield) > 1;

UPDATE trading_universo SET roic = NULL
WHERE roic IS NOT NULL AND abs(roic) > 10;

UPDATE trading_universo SET momentum = NULL
WHERE momentum IS NOT NULL AND (momentum > 100 OR momentum < -0.99);
