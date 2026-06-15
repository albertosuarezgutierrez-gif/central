-- Solicitudes del empleado (vacaciones, permisos, parte médico…) con flujo de aprobación.
create table rrhh.solicitudes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references rrhh.empresas(id),
  empleado_id uuid not null references rrhh.empleados(id) on delete cascade,
  tipo text not null,                  -- vacaciones | permiso_retribuido | parte_medico | baja | otro
  fecha_inicio date,
  fecha_fin date,
  motivo text,
  estado text not null default 'solicitada',  -- solicitada | aprobada | rechazada
  resuelta_por uuid,
  resuelta_at timestamptz,
  creada_at timestamptz not null default now()
);
create index solicitudes_empleado_idx on rrhh.solicitudes(empleado_id);
create index solicitudes_empresa_idx on rrhh.solicitudes(empresa_id);

alter table rrhh.solicitudes enable row level security;
