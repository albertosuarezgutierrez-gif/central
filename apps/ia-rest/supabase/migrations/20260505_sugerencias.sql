-- ──────────────────────────────────────────────────────────────
-- sugerencias: feedback de usuarios (camarero, cocina, owner…)
-- hacia el super_admin (Alberto)
-- ──────────────────────────────────────────────────────────────

create table if not exists public.sugerencias (
  id              uuid primary key default gen_random_uuid(),
  restaurante_id  uuid references public.restaurantes(id) on delete cascade,
  camarero_id     uuid references public.camareros(id) on delete set null,
  rol             text not null check (rol in ('super_admin','owner','admin','jefe_sala','camarero','cocina')),
  nombre_usuario  text not null,
  categoria       text not null default 'mejora' check (categoria in ('bug','mejora','idea','urgente')),
  texto           text not null check (char_length(texto) >= 5 and char_length(texto) <= 1000),
  leida           boolean not null default false,
  estado          text not null default 'nueva' check (estado in ('nueva','en_revision','resuelta','descartada')),
  nota_admin      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Índices
create index if not exists idx_sugerencias_restaurante on public.sugerencias(restaurante_id);
create index if not exists idx_sugerencias_leida on public.sugerencias(leida) where leida = false;
create index if not exists idx_sugerencias_estado on public.sugerencias(estado);
create index if not exists idx_sugerencias_created on public.sugerencias(created_at desc);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_sugerencias_updated_at on public.sugerencias;
create trigger trg_sugerencias_updated_at
  before update on public.sugerencias
  for each row execute function public.set_updated_at();

-- RLS
alter table public.sugerencias enable row level security;

-- Cualquier usuario autenticado puede insertar sugerencias de su restaurante
create policy "sugerencias_insert" on public.sugerencias
  for insert with check (true);

-- Solo super_admin lee y actualiza (via service_role en API)
create policy "sugerencias_select_service" on public.sugerencias
  for select using (false);  -- bloqueado; acceso solo via service_role en Edge Functions / API

-- Vista para contar no leídas (usada en badge del super panel)
create or replace view public.v_sugerencias_stats as
select
  count(*)                                                as total,
  count(*) filter (where leida = false)                   as no_leidas,
  count(*) filter (where estado = 'nueva')               as nuevas,
  count(*) filter (where categoria = 'urgente')          as urgentes,
  count(*) filter (where categoria = 'bug')              as bugs
from public.sugerencias;
