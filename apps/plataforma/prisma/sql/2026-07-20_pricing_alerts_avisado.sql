-- Guardián de precios (20/07/2026): marca cuándo se avisó por Telegram de cada alerta de pricing,
-- para no repetir el mismo aviso en cada pasada del cron `/api/sivra/pricing/guard` (diario).
-- NULL = pendiente de avisar. La rellena el guard tras mandar el Telegram.
ALTER TABLE pricing_alerts ADD COLUMN IF NOT EXISTS avisado_at timestamptz;
