-- Mensajería 1-a-1 responsable ↔ empleado. Un hilo implícito por empleado.
-- (A futuro, si el cliente tiene varios productos, se promueve a module-chat por cuenta_id en plataforma.)

create table rrhh.mensajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references rrhh.empresas(id),
  empleado_id uuid not null references rrhh.empleados(id) on delete cascade,
  remitente text not null,             -- 'gestor' | 'titular'
  texto text not null,
  leido_gestor boolean not null default false,
  leido_titular boolean not null default false,
  creada_at timestamptz not null default now()
);
create index mensajes_empleado_idx on rrhh.mensajes(empleado_id);

alter table rrhh.mensajes enable row level security;
