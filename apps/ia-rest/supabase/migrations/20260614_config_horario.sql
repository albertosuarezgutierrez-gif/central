-- Control horario: configuración por local (toggles + límites legales RD 8/2019).
-- Aditiva e idempotente. Una fila por local; defaults legales si no se toca.
create table if not exists public.config_horario (
  local_id uuid primary key,
  -- límites legales/convenio
  jornada_max_diaria numeric not null default 9,
  jornada_max_semanal numeric not null default 40,
  descanso_min_entre_jornadas numeric not null default 12,
  descanso_semanal_horas numeric not null default 35,
  tope_extra_anual numeric not null default 80,
  -- toggles por función
  firma_empleado boolean not null default false,
  avisos_descanso boolean not null default true,
  aviso_horas_extra boolean not null default true,
  fichaje_qr boolean not null default false,
  validar_ip_local boolean not null default false,
  autocierre_turnos boolean not null default false,
  recordatorios_push boolean not null default true,
  coste_personal boolean not null default false,
  festivos_activo boolean not null default false,
  -- datos auxiliares
  ips_local text[] not null default '{}',
  autocierre_horas numeric not null default 14,
  festivos jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.config_horario enable row level security;

drop policy if exists ch_service on public.config_horario;
create policy ch_service on public.config_horario for all using (auth.role() = 'service_role');
drop policy if exists ch_select on public.config_horario;
create policy ch_select on public.config_horario for select using (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists ch_insert on public.config_horario;
create policy ch_insert on public.config_horario for insert with check (local_id = (current_setting('app.local_id'::text))::uuid);
drop policy if exists ch_update on public.config_horario;
create policy ch_update on public.config_horario for update using (local_id = (current_setting('app.local_id'::text))::uuid);
