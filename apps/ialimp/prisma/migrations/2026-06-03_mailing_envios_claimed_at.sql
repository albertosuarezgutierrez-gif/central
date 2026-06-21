-- Recuperación de envíos atascados: si una pasada del agente reclama un envío
-- (estado='enviando') y la función serverless muere antes de completarlo (p.ej.
-- la IA se cuelga), la fila quedaba bloqueada para siempre. `claimed_at` permite
-- reclamar los 'enviando' antiguos y reintentarlos.
ALTER TABLE mailing_envios ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
