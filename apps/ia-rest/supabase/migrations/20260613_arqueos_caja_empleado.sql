-- Persistencia y auditoría del cuadre de caja POR EMPLEADO.
-- Aditiva e idempotente. Espejo de arqueos_caja (tenant por app.local_id + service_role).

create table if not exists public.arqueos_caja_empleado (
  id uuid primary key default gen_random_uuid(),
  arqueo_id uuid not null references public.arqueos_caja(id) on delete cascade,
  local_id uuid not null,
  fecha date not null,
  camarero_id uuid,
  camarero_nombre text,
  fondo_inicial   numeric not null default 0,
  cobros_efectivo numeric not null default 0,
  salidas_caja    numeric not null default 0,
  saldo_teorico   numeric not null default 0,
  fondo_final     numeric not null default 0,
  diferencia_caja numeric not null default 0,
  conteo_realizado boolean not null default false,
  notas text,                  -- motivo del descuadre (obligatorio sobre umbral)
  confirmado_por uuid,         -- firma del empleado que acepta su arqueo
  confirmado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ace_hist   on public.arqueos_caja_empleado (local_id, camarero_id, fecha);
create index if not exists idx_ace_arqueo on public.arqueos_caja_empleado (arqueo_id);

alter table public.arqueos_caja_empleado enable row level security;

drop policy if exists ace_service on public.arqueos_caja_empleado;
create policy ace_service on public.arqueos_caja_empleado for all
  using (auth.role() = 'service_role');

drop policy if exists ace_select on public.arqueos_caja_empleado;
create policy ace_select on public.arqueos_caja_empleado for select
  using (local_id = (current_setting('app.local_id'::text))::uuid);

drop policy if exists ace_insert on public.arqueos_caja_empleado;
create policy ace_insert on public.arqueos_caja_empleado for insert
  with check (local_id = (current_setting('app.local_id'::text))::uuid);

drop policy if exists ace_update on public.arqueos_caja_empleado;
create policy ace_update on public.arqueos_caja_empleado for update
  using (local_id = (current_setting('app.local_id'::text))::uuid);

drop policy if exists ace_delete on public.arqueos_caja_empleado;
create policy ace_delete on public.arqueos_caja_empleado for delete
  using (local_id = (current_setting('app.local_id'::text))::uuid);

-- Config: umbral de descuadre para alertas + conteo ciego (blind count)
alter table public.config_contabilidad add column if not exists umbral_descuadre numeric not null default 5;
alter table public.config_contabilidad add column if not exists conteo_ciego boolean not null default false;
