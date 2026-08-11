-- 2026-08-05 — Saneo de duplicados del libro paper + únicos anti-reintento.
-- El 04/08/2026 la pasada nocturna corrió ~5 veces contra /api/trading/analizar y, como el endpoint
-- no era idempotente, dejó 5 órdenes BUY idénticas (MSFT) y 288 tesis donde tocaban 52. Las tesis
-- duplicadas habrían inflado el n del walk-forward al madurar (10 días); las órdenes duplicadas
-- inflaban opsPorNombre (barrera de límite de ops).
-- Idempotente: se puede re-ejecutar sin efecto.

BEGIN;

-- 1) Tesis: quedarse con UNA fila por (simbolo, fecha, estrategia).
--    Todas las copias de una misma pasada son idénticas (el updateMany de `operada` las marcó todas),
--    así que conservamos la más antigua. Borrar la tesis arrastra su resultado (FK ON DELETE CASCADE),
--    y a 04/08 ninguna duplicada tiene resultado aún (maduran a 10 días).
DELETE FROM trading_tesis t
USING trading_tesis k
WHERE k.simbolo = t.simbolo AND k.fecha = t.fecha AND k.estrategia = t.estrategia
  AND k.created_at < t.created_at;

-- Empate exacto de created_at (createMany en lote): desempata por id.
DELETE FROM trading_tesis t
USING trading_tesis k
WHERE k.simbolo = t.simbolo AND k.fecha = t.fecha AND k.estrategia = t.estrategia
  AND k.created_at = t.created_at AND k.id < t.id;

-- 2) Órdenes: una por (simbolo, lado, fecha).
DELETE FROM trading_paper_orden o
USING trading_paper_orden k
WHERE k.simbolo = o.simbolo AND k.lado = o.lado AND k.fecha = o.fecha
  AND (k.created_at < o.created_at OR (k.created_at = o.created_at AND k.id < o.id));

-- 3) Únicos que hacen idempotentes los reintentos (los endpoints escriben con createMany+skipDuplicates).
CREATE UNIQUE INDEX IF NOT EXISTS trading_tesis_simbolo_fecha_estrategia_key
  ON trading_tesis (simbolo, fecha, estrategia);
CREATE UNIQUE INDEX IF NOT EXISTS trading_paper_orden_simbolo_lado_fecha_key
  ON trading_paper_orden (simbolo, lado, fecha);

COMMIT;
