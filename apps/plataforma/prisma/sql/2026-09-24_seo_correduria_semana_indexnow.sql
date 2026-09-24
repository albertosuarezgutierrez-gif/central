-- seo_correduria_semana: añade 'indexnow' al CHECK de `fuente`. El cron seo-correduria guarda ahí
-- lo ya avisado a IndexNow (url → lastmod del sitemap) para mandar solo lo nuevo o cambiado.
-- Se conservan todas las anteriores ('serp' incluida: filas históricas).
--
-- Aplicar como postgres por el Supabase MCP (NO por el rol de la app). Idempotente.

ALTER TABLE public.seo_correduria_semana DROP CONSTRAINT IF EXISTS seo_correduria_semana_fuente_check;
ALTER TABLE public.seo_correduria_semana
  ADD CONSTRAINT seo_correduria_semana_fuente_check CHECK (fuente IN ('gsc', 'serp', 'posthog', 'cobertura', 'indexnow'));
