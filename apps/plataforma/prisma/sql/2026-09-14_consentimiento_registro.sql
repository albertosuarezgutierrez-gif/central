-- consentimiento_registro — prueba de qué se aceptó/rechazó y cuándo, sustituye al registro
-- que daba Cookiebot. SIN PII a propósito: ni IP, ni user-agent, ni identificador de persona.
-- Aplicar como postgres por el Supabase MCP. Idempotente.

CREATE TABLE IF NOT EXISTS public.consentimiento_registro (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  app        text        NOT NULL CHECK (app IN ('asegura-web', 'ia-rest', 'housesevillana')),
  categorias jsonb       NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consentimiento_registro_app_creado_idx
  ON public.consentimiento_registro (app, creado_en DESC);

ALTER TABLE public.consentimiento_registro ENABLE ROW LEVEL SECURITY;
