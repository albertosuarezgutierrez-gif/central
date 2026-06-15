-- rrhh vive en su propio SCHEMA `rrhh` dentro del proyecto Supabase COMPARTIDO
-- (wswbehlcuxqxyinousql), aislado del schema public de ialimp/sivra/plataforma.
-- La conexión de rrhh usa DATABASE_URL con `?schema=rrhh`, así Prisma mapea estas tablas.
-- Free tier (límite de 2 proyectos gratis alcanzado); migrable a proyecto dedicado en plan de pago.

create schema if not exists rrhh;

create table rrhh.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  marca_logo text,
  marca_color text,
  creada_at timestamptz not null default now()
);

create table rrhh.usuarios_rrhh (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references rrhh.empresas(id),
  email text not null unique,
  pass_hash text not null,
  nombre text not null,
  session_jti text,
  creada_at timestamptz not null default now()
);

create table rrhh.empleados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references rrhh.empresas(id),
  nombre text not null,
  dni text,
  email text,
  telefono text,
  puesto text,
  fecha_alta date,
  estado text not null default 'activo',
  acceso_token text not null unique,
  pin_hash text,
  creada_at timestamptz not null default now()
);
create index empleados_empresa_idx on rrhh.empleados(empresa_id);

-- Acceso solo vía service_role desde el backend (scope por empresa_id en código).
alter table rrhh.empresas enable row level security;
alter table rrhh.usuarios_rrhh enable row level security;
alter table rrhh.empleados enable row level security;
