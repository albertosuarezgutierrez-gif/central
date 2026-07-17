-- Rol por sección para cuentas (aplicada por Supabase MCP como postgres el 2026-07-17).
-- rol NULL = cuenta completa (comportamiento actual). 'empresas' = solo la sección Empresas.
ALTER TABLE public.cuentas ADD COLUMN IF NOT EXISTS rol text;
