-- 🔭 RETROVISOR del radar (backtest punto-en-el-tiempo, SOLO paper). Una fila por símbolo:
-- datos.porFecha = factores conocidos el día 1 de cada mes (solo 10-K con filed anterior — sin
-- look-ahead) + retornos forward 28/56/91d. Fila especial '_GURUS_' = convicciones Dataroma ×
-- factores actuales. INDICATIVO — separado a propósito de las tablas honestas del forward.
-- Aplicar por Supabase MCP (rol postgres). Idempotente.
CREATE TABLE IF NOT EXISTS trading_backtest (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simbolo        text NOT NULL UNIQUE,
  cik            text,
  nombre         text,
  datos          jsonb,
  error          text,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_backtest_actualizado_en_idx ON trading_backtest (actualizado_en);
ALTER TABLE trading_backtest ENABLE ROW LEVEL SECURITY;
