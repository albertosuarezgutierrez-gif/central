-- 🌱 Cantera capa C del trading-analista: registro de propuestas radar → watchlist.
-- El radar semanal propone por Telegram los valores sostenidos ≥2 semanas en su top-10;
-- decision NULL = pendiente de Alberto · 'alta' = insertado en trading_watchlist (capa C)
-- · 'rechazada' = no volver a proponer. Aplicar por Supabase MCP (rol postgres).
CREATE TABLE IF NOT EXISTS trading_cantera (
  simbolo          text PRIMARY KEY,
  semanas_seguidas int,
  propuesto_at     timestamptz NOT NULL DEFAULT now(),
  decision         text,
  decidido_at      timestamptz
);
