-- H13 (alfa) del pre-registro de trading, 28/08/2026.
--
-- `puntuarTesis` medía el retorno ABSOLUTO: una tesis alcista «acierta» si el precio sube, que en un
-- tramo alcista lo hace el mercado, no la estrategia. Y ese hit-rate es justo lo que `ajustesDeStats`
-- convierte en delta de confianza del torneo. Estas columnas guardan el exceso sobre el índice (SPY)
-- para poder resolver H13 con datos. Se RECOLECTAN: el torneo sigue decidiendo con lo bruto.
--
-- NULL = «no se pudo medir» (no había serie del índice, o su ventana no era la de la tesis), nunca 0:
-- un alfa de cero significa «igualó al mercado», que es una afirmación distinta.
ALTER TABLE trading_tesis_resultado
  ADD COLUMN IF NOT EXISTS retorno_alfa  double precision,
  ADD COLUMN IF NOT EXISTS retorno_bench double precision;

COMMENT ON COLUMN trading_tesis_resultado.retorno_alfa IS
  'Exceso sobre el índice en la dirección de la tesis (H13). NULL = no medible, nunca 0.';
COMMENT ON COLUMN trading_tesis_resultado.retorno_bench IS
  'Retorno del SPY en la MISMA ventana, de la misma fuente que el contraste. La entrada de retorno_alfa.';

-- Agregados por estrategia. `n_alfa` cuenta SOLO las observaciones con benchmark: contar las que no lo
-- tienen como alfa 0 acercaría la media a cero sola. Por eso es una columna aparte de `n`.
ALTER TABLE trading_estrategia_stats
  ADD COLUMN IF NOT EXISTS hit_rate_alfa      double precision,
  ADD COLUMN IF NOT EXISTS retorno_alfa_medio double precision,
  ADD COLUMN IF NOT EXISTS n_alfa             integer NOT NULL DEFAULT 0;
