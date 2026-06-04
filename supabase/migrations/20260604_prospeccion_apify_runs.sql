-- Tabla de estado de runs de Apify Google Places (sourcing en 2 fases).
-- Tabla CRM global (sin restaurante_id) — solo la usa el cron con service role.
CREATE TABLE IF NOT EXISTS prospeccion_apify_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical         TEXT NOT NULL,                 -- 'catering' | 'eventos' | 'restaurante'
  query            TEXT NOT NULL,
  run_id           TEXT,
  dataset_id       TEXT,
  status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'ingested' | 'failed'
  items_total      INT DEFAULT 0,
  items_ingestados INT DEFAULT 0,
  started_at       TIMESTAMPTZ DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prospeccion_apify_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON prospeccion_apify_runs
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_apify_runs_status ON prospeccion_apify_runs(status);
