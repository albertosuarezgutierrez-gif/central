-- H4 (pre-registro) CUMPLIDA el 19/07/2026: el FCF yield mostró spread de medianas mejor que el EY
-- (−2,4 pp vs −5,0 pp) y el mejor freno anti-batacazo medido (Q5 6,0% vs Q1 12,1% de caídas >15%).
-- Se añade a la caché del radar; entra al blend por el hueco fcfYield que ya tenía rankearFactores.
-- Aplicar por Supabase MCP. Idempotente.
ALTER TABLE trading_universo ADD COLUMN IF NOT EXISTS fcf_yield float8;
