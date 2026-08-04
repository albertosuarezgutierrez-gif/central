-- TEMPORAL (Fase 3 subastas, 29/07/2026): token del puente de exploración
-- `/api/subastas/fase3-debug`. Fila única; el valor del token se inserta por
-- Supabase MCP (NUNCA en el repo) y se revoca con `activo=false` o borrando la
-- fila. La tabla y el endpoint se eliminan al cerrar la fase.
CREATE TABLE IF NOT EXISTS public.subastas_debug_token (
  id int PRIMARY KEY,
  token text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.subastas_debug_token FROM anon, authenticated;
