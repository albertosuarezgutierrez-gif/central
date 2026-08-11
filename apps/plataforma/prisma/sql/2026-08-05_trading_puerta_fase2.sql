-- 2026-08-05 — Ideas de mejora del laboratorio de trading (decisión de Alberto, misma sesión que el
-- saneo de duplicados): deslizamiento señal→día siguiente, motivo de bloqueo de señales, y contador
-- de pasadas (los únicos anti-duplicado hacen invisibles los reintentos; esto los vuelve a hacer visibles).
-- Idempotente.

-- Deslizamiento (proxy): precio del día siguiente a la señal, lo rellena /api/trading/puntuar.
ALTER TABLE trading_paper_orden ADD COLUMN IF NOT EXISTS precio_dia_siguiente DOUBLE PRECISION;

-- Por qué NO se compró una señal ganadora alcista (posición ya abierta, bajo SMA50, earnings…).
ALTER TABLE trading_tesis ADD COLUMN IF NOT EXISTS motivo_bloqueo TEXT;

-- Contador de ejecuciones de /analizar por día (aviso Telegram al llegar a 2).
CREATE TABLE IF NOT EXISTS trading_pasadas (
  fecha    DATE PRIMARY KEY,
  analizar INTEGER NOT NULL DEFAULT 0
);
