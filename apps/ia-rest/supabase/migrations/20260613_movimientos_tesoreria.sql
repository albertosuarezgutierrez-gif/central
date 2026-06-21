-- Tesorería: efectivo más allá del cajón (caja fuerte ↔ banco). Aditiva e idempotente.
create table if not exists public.movimientos_tesoreria (
  id uuid primary key default gen_random_uuid(),
  local_id uuid not null,
  tipo text not null,            -- 'ingreso_caja_fuerte' | 'retirada_banco' | 'entrada_banco' | 'ajuste'
  importe numeric not null,
  referencia text,               -- nº de ingreso/remesa
  fecha date not null default current_date,
  notas text,
  creado_por uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_tesoreria_local_fecha on public.movimientos_tesoreria (local_id, fecha);

alter table public.movimientos_tesoreria enable row level security;

drop policy if exists tes_service on public.movimientos_tesoreria;
create policy tes_service on public.movimientos_tesoreria for all using (auth.role() = 'service_role');
drop policy if exists tes_select on public.movimientos_tesoreria;
create policy tes_select on public.movimientos_tesoreria for select using (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists tes_insert on public.movimientos_tesoreria;
create policy tes_insert on public.movimientos_tesoreria for insert with check (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists tes_update on public.movimientos_tesoreria;
create policy tes_update on public.movimientos_tesoreria for update using (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists tes_delete on public.movimientos_tesoreria;
create policy tes_delete on public.movimientos_tesoreria for delete using (local_id = (current_setting('app.local_id'::text))::uuid);
