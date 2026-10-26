-- 2026-10-26 · trading_watchlist.contract_id = id de contrato IBKR. NULL = «no resuelto» (nunca 0).
-- Idempotente. NO aplicado por la sesión que lo escribió.
alter table trading_watchlist add column if not exists contract_id bigint null;
