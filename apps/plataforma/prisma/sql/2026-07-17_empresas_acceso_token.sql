-- Token de acceso INVITADO a «Empresas» (para Pablo) guardado en BD en vez de env, para poder
-- rotarlo/revocarlo sin redeploy de Vercel. Fila única (id=1). Aplicada por Supabase MCP el 2026-07-17.
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon.
CREATE TABLE IF NOT EXISTS public.empresas_acceso_token (
  id             int PRIMARY KEY DEFAULT 1,
  token          text NOT NULL,
  activo         boolean NOT NULL DEFAULT true,
  nota           text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empresas_acceso_token_single CHECK (id = 1)
);
REVOKE ALL ON public.empresas_acceso_token FROM anon, authenticated;

-- El valor real del token se inserta/rota por Supabase MCP (no se versiona el secreto aquí).
-- INSERT INTO public.empresas_acceso_token (id, token, activo, nota)
--   VALUES (1, '<token>', true, 'Pablo (prueba Empresas)')
--   ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token, activo = true, actualizado_en = now();
