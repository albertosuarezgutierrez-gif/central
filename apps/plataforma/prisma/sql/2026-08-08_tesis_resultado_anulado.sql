-- Higiene del track record de trading (08/08/2026).
--
-- Contexto: el 03/08/2026 la pasada mandó a /api/trading/puntuar un precio imposible para CVX
-- (590,17 $ cuando Chevron cerró a 193,18 $ — contrastado contra IBKR: 192,31 el 30/07, 193,18 el
-- 03/08, 190,40 el 04/08). El endpoint no comprobaba nada, así que ese número puntuó 12 tesis ya
-- vencidas, tres de ellas con +205 pp. Como `trading_estrategia_stats` se recalcula sobre TODOS los
-- resultados, el efecto llegaba al walk-forward que gobierna el despliegue de capital:
--   momentum alcista   +0,91 pp  →  +88,09 pp   (y 100% de acierto sobre 7 en vez de sobre 4)
--   reversión bajista  +2,01 pp  →  −21,08 pp   (cambio de SIGNO)
--
-- Dos partes: (1) las columnas para poder ANULAR sin borrar, (2) el saneo de las 12 filas.
-- Idempotente: se puede volver a ejecutar sin efecto.

-- ---------------------------------------------------------------------------
-- 1) Columnas
-- ---------------------------------------------------------------------------
ALTER TABLE "trading_tesis_resultado"
  ADD COLUMN IF NOT EXISTS "anulado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "anulado_motivo" TEXT;

COMMENT ON COLUMN "trading_tesis_resultado"."anulado" IS
  'true = puntuado con un precio que luego se demostró falso; excluido de las stats de estrategia. No se borra la fila: se marca.';
COMMENT ON COLUMN "trading_tesis_resultado"."anulado_motivo" IS
  'Qué pasó. Sobrevive a la re-puntuación como registro histórico.';

-- ---------------------------------------------------------------------------
-- 2) Saneo de las 12 filas envenenadas por CVX = 590,17 del 2026-08-03
-- ---------------------------------------------------------------------------
-- Se re-puntúan con el cierre REAL de CVX ese día (193,18 $, fuente Interactive Brokers) replicando
-- EXACTAMENTE `puntuarTesis` de packages/module-trading/src/scoring.ts:
--   movimiento = (precioDespues - precioRef) / precioRef
--   acierto    = (alcista Y subió) O (bajista Y no subió) O (neutral Y |movimiento| < 0,02)
--   retorno    = bajista ? -movimiento : neutral ? 0 : movimiento
--
-- ⚠️ El precio viene de IBKR y el resto del corpus de la fuente de la sesión: NO son el mismo dato.
-- Se asume a conciencia para 12 filas, y es exactamente por lo que la recuperación automática de
-- /puntuar sigue pendiente de una columna de procedencia (patrón `market_rates.fuente`).
WITH real AS (SELECT 193.18::double precision AS precio, '2026-08-03'::date AS dia)
UPDATE "trading_tesis_resultado" r
SET precio_despues = real.precio,
    retorno = CASE t.direccion
                WHEN 'bajista' THEN -((real.precio - t.precio_ref) / t.precio_ref)
                WHEN 'neutral' THEN 0
                ELSE (real.precio - t.precio_ref) / t.precio_ref
              END,
    acierto = (t.direccion = 'alcista' AND real.precio > t.precio_ref)
           OR (t.direccion = 'bajista' AND NOT (real.precio > t.precio_ref))
           OR (t.direccion = 'neutral' AND abs((real.precio - t.precio_ref) / t.precio_ref) < 0.02),
    anulado = false,
    anulado_motivo = 'Puntuada el 2026-08-03 con CVX=590,17 (falso; cierre real 193,18 según IBKR). Re-puntuada el 2026-08-08 con el cierre real.'
FROM "trading_tesis" t, real
WHERE t.id = r.tesis_id
  AND r.precio_despues = 590.17
  AND t.simbolo = 'CVX';

-- Red de seguridad: si quedara alguna fila con el precio imposible que la anterior no cubriese
-- (otro símbolo), se ANULA en vez de re-puntuarse a ciegas — no sabemos cuál era su precio bueno.
UPDATE "trading_tesis_resultado"
SET anulado = true,
    anulado_motivo = COALESCE(anulado_motivo, 'Precio 590,17 imposible para este símbolo; sin cierre real verificado, el resultado no es conocimiento.')
WHERE precio_despues = 590.17 AND NOT anulado;
