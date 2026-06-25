-- Comentario libre por movimiento bancario (nota del usuario para controlar mejor un gasto:
-- qué es, a qué corresponde, etc.). Texto opcional; no afecta a la clasificación ni al P&L.
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS comentario text;
