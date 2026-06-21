-- Abastecimiento de cambio: mínimos por denominación para avisar si el cajón se queda corto.
-- Aditiva e idempotente. min_monedas = { '0.5': 20, '0.2': 25, ... }
alter table public.config_contabilidad add column if not exists min_monedas jsonb;
