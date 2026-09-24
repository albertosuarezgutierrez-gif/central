-- seo_correduria_semana — foto semanal de las fuentes del agente SEO de la correduría.
-- Una fila por (semana, fuente) con tri-estado: ok | error | no_configurado. Un estado
-- distinto de ok NO es «cero impresiones» ni «no hay competidores»: es que no se leyó.
-- Spec: docs/superpowers/specs/2026-09-08-seo-correduria-conectores-design.md
--
-- Aplicar como postgres por el Supabase MCP (NO por el rol de la app). Idempotente.
-- Comprobado el 08/09/2026 con list_tables que NO existía ninguna tabla homónima (la landmine
-- del CREATE TABLE IF NOT EXISTS sobre una tabla previa no aplica aquí).

CREATE TABLE IF NOT EXISTS public.seo_correduria_semana (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  semana     date        NOT NULL,
  fuente     text        NOT NULL CHECK (fuente IN ('gsc', 'serp', 'posthog')),
  estado     text        NOT NULL CHECK (estado IN ('ok', 'error', 'no_configurado')),
  detalle    text,
  datos      jsonb,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seo_correduria_semana_semana_fuente_key
  ON public.seo_correduria_semana (semana, fuente);
CREATE INDEX IF NOT EXISTS seo_correduria_semana_fuente_semana_idx
  ON public.seo_correduria_semana (fuente, semana DESC);

ALTER TABLE public.seo_correduria_semana ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.seo_correduria_semana TO prisma_plataforma;
