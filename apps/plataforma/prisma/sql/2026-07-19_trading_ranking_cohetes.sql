-- 🚀 Satélite caza-cohetes del radar (lista lotería aparte del núcleo, con su propio track record).
-- Aplicar por Supabase MCP. Idempotente.
ALTER TABLE trading_ranking ADD COLUMN IF NOT EXISTS cohetes jsonb;
