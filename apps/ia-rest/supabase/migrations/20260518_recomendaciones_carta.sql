-- ──────────────────────────────────────────────────────────────
-- recomendaciones_carta: productos del día con ventana de tiempo
-- y/o límite de cantidad. Puramente informativo para camarero.
-- El dueño lo gestiona desde /owner → Carta → Recomend.
-- ──────────────────────────────────────────────────────────────

create table if not exists public.recomendaciones_carta (
  id               uuid primary key default gen_random_uuid(),
  restaurante_id   uuid not null references public.restaurantes(id) on delete cascade,
  producto_id      uuid not null references public.productos(id)    on delete cascade,
  nota             text,                              -- nota del chef (libre)
  hora_desde       time,                              -- disponible desde (null = todo el día)
  hora_hasta       time,                              -- disponible hasta (null = todo el día)
  cantidad_max     int  check (cantidad_max > 0),     -- unidades máx (null = ilimitado)
  cantidad_servida int  not null default 0,           -- incrementado manualmente desde /edge
  fecha            date not null default current_date,
  activa           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- Índices
create index if not exists idx_reccarta_restaurante on public.recomendaciones_carta(restaurante_id);
create index if not exists idx_reccarta_fecha       on public.recomendaciones_carta(fecha desc);
create index if not exists idx_reccarta_activa      on public.recomendaciones_carta(activa) where activa = true;

-- RLS: solo service_role (las APIs del proyecto usan service_role via createServerClient)
alter table public.recomendaciones_carta enable row level security;

create policy "reccarta_service_all" on public.recomendaciones_carta
  using (auth.role() = 'service_role');

-- ── Vista: recomendaciones activas ahora mismo ──────────────────
create or replace view public.v_recomendaciones_activas as
select
  r.id,
  r.restaurante_id,
  r.producto_id,
  p.nombre            as producto_nombre,
  coalesce(p.precio, 0) as precio,
  p.categoria         as categoria,
  r.nota,
  r.hora_desde,
  r.hora_hasta,
  r.cantidad_max,
  r.cantidad_servida,
  case
    when r.cantidad_max is null then null
    else (r.cantidad_max - r.cantidad_servida)
  end                 as cantidad_restante,
  r.fecha,
  r.activa
from public.recomendaciones_carta r
join public.productos p on p.id = r.producto_id
where
  r.activa = true
  and r.fecha = current_date
  and (r.cantidad_max is null or r.cantidad_servida < r.cantidad_max)
  and (r.hora_desde  is null or current_time >= r.hora_desde)
  and (r.hora_hasta  is null or current_time <= r.hora_hasta);
