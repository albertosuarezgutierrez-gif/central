-- Ledger de llamadas a la API oficial de Idealista (Search API, tramo gratuito
-- ~100 búsquedas/mes). Cada búsqueda ejecutada = una fila; el presupuesto
-- mensual y la caché por zona (30 días) se calculan contando aquí — sin
-- memoria en proceso, que en Vercel no sobrevive entre pasadas.
-- Consumidor: apps/plataforma/lib/subastas/idealista-api.ts (cron subastas-mercado).
CREATE TABLE IF NOT EXISTS idealista_api_usos (
  id bigserial PRIMARY KEY,
  zona text NOT NULL,
  resultados int,
  llamada_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_idealista_usos_llamada ON idealista_api_usos (llamada_at);
CREATE INDEX IF NOT EXISTS idx_idealista_usos_zona ON idealista_api_usos (zona, llamada_at DESC);
