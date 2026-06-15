-- Banca · marca "por revisar" en movimientos_bancarios. La auto-categorización IA diaria
-- marca requiere_revision=true cuando NO está segura de la categoría → el dueño la asigna
-- a mano en /banca (bandeja "Por revisar"). Aditivo, ya aplicado por Supabase MCP.
alter table public.movimientos_bancarios
  add column if not exists requiere_revision boolean not null default false;
