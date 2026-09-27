-- seo_correduria_semana: añade 'cobertura' (URL Inspection API — indexación real de páginas
-- propias) al CHECK de `fuente`. Tercera fuente del cron seo-correduria, junto a gsc/posthog.
-- 'serp' se conserva en la lista aunque ya no se escriba (filas históricas de Serper, retirado
-- el 14/09/2026 — ver el propio route.ts).
--
-- Aplicar como postgres por el Supabase MCP (NO por el rol de la app). Idempotente.

ALTER TABLE public.seo_correduria_semana DROP CONSTRAINT IF EXISTS seo_correduria_semana_fuente_check;
ALTER TABLE public.seo_correduria_semana
  ADD CONSTRAINT seo_correduria_semana_fuente_check CHECK (fuente IN ('gsc', 'serp', 'posthog', 'cobertura'));
