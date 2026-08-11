-- Lentes sobre el corpus de subastas (29/07/2026):
--   🔨 flip (comprar-reformar-vender): margen determinista con reforma por baremo
--   🏖️ playa (segunda residencia costa de Huelva)
--   🚦 semáforo documental (análisis profundo de casuísticas)
-- Las rellena `lib/subastas/clasificar.ts` en el cron `subastas-enriquecer`.
-- ⚠️ Añadidas también a COLS_SUBASTA (lib/subastas-radar.ts) — landmine del fts.
ALTER TABLE subastas
  ADD COLUMN IF NOT EXISTS es_playa boolean,
  ADD COLUMN IF NOT EXISTS margen_flip numeric,
  ADD COLUMN IF NOT EXISTS margen_flip_pct numeric,
  ADD COLUMN IF NOT EXISTS flip_apto boolean,
  ADD COLUMN IF NOT EXISTS semaforo text,
  ADD COLUMN IF NOT EXISTS analisis jsonb;

CREATE INDEX IF NOT EXISTS subastas_es_playa_idx ON subastas (es_playa) WHERE es_playa = true;
CREATE INDEX IF NOT EXISTS subastas_tipo_bien_idx ON subastas (tipo_bien);
