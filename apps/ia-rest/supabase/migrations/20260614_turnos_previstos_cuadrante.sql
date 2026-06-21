-- Cuadrante / plantilla: turnos PREVISTOS (planificación) para comparar con lo fichado real.
-- Aditiva, RLS espejo por local_id.
create table if not exists public.turnos_previstos (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null,
  camarero_id uuid,
  camarero_nombre text,
  fecha date not null,
  hora_inicio text not null,   -- 'HH:MM'
  hora_fin text not null,      -- 'HH:MM'
  tipo text not null default 'normal',
  notas text,
  creado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_turnos_previstos_local_fecha on public.turnos_previstos (local_id, fecha);

alter table public.turnos_previstos enable row level security;
drop policy if exists tp_service on public.turnos_previstos;
create policy tp_service on public.turnos_previstos for all using (auth.role() = 'service_role');
drop policy if exists tp_select on public.turnos_previstos;
create policy tp_select on public.turnos_previstos for select using (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists tp_insert on public.turnos_previstos;
create policy tp_insert on public.turnos_previstos for insert with check (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists tp_update on public.turnos_previstos;
create policy tp_update on public.turnos_previstos for update using (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists tp_delete on public.turnos_previstos;
create policy tp_delete on public.turnos_previstos for delete using (local_id = (current_setting('app.local_id'::text))::uuid);
