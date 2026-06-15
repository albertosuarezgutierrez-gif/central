create extension if not exists "uuid-ossp";

create table empresas (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null,
  marca_logo text,
  marca_color text,
  creada_at timestamptz not null default now()
);

create table usuarios_rrhh (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id),
  email text not null unique,
  pass_hash text not null,
  nombre text not null,
  session_jti text,
  creada_at timestamptz not null default now()
);

create table empleados (
  id uuid primary key default uuid_generate_v4(),
  empresa_id uuid not null references empresas(id),
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
create index empleados_empresa_idx on empleados(empresa_id);
