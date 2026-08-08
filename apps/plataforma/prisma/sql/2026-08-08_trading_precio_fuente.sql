-- Procedencia del precio en el corpus de trading (08/08/2026).
--
-- Por qué: un cierre de IBKR (que manda la sesión) y uno de Stooq (que el servidor puede sacar solo)
-- NO son el mismo dato. Hoy TODO viene de la sesión y por eso no se notaba, pero en cuanto exista
-- cualquier camino que rellene precios sin la sesión —la recuperación automática de /puntuar, un
-- backfill como el de las 12 filas de CVX del 2026-08-03— el track record pasaría a mezclar fuentes
-- sin dejar rastro. Y ese track record es lo que gobierna el despliegue de capital real.
--
-- Mismo patrón que `market_rates.fuente` (2026-08-06): default CONSERVADOR = lo que las filas ya son.
-- Valores previstos: 'sesion' (IBKR vía la rutina) · 'stooq' / 'yahoo' (fuente propia del servidor) ·
-- 'manual' (corrección a mano, como el saneo del cierre real de CVX).
--
-- Idempotente.

ALTER TABLE "trading_tesis"
  ADD COLUMN IF NOT EXISTS "precio_fuente" TEXT NOT NULL DEFAULT 'sesion';

ALTER TABLE "trading_tesis_resultado"
  ADD COLUMN IF NOT EXISTS "precio_fuente" TEXT NOT NULL DEFAULT 'sesion';

COMMENT ON COLUMN "trading_tesis"."precio_fuente" IS
  'Procedencia de precio_ref: sesion (IBKR) | stooq | yahoo | manual. Default conservador = sesion.';
COMMENT ON COLUMN "trading_tesis_resultado"."precio_fuente" IS
  'Procedencia de precio_despues. Mismo contrato que trading_tesis.precio_fuente.';

-- Las 12 filas re-puntuadas el 2026-08-08 con el cierre real de CVX salieron de IBKR a mano, no de la
-- sesión: se marcan como tales para que ninguna lectura futura las cuente como parte del flujo normal.
UPDATE "trading_tesis_resultado"
SET precio_fuente = 'manual'
WHERE anulado_motivo LIKE '%Re-puntuada el 2026-08-08%';
