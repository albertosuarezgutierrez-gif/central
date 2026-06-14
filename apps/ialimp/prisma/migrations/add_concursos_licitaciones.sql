-- Buscador de pliegos: corpus compartido de licitaciones (no por empresa).
create table if not exists concursos_licitaciones (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  titulo text not null,
  objeto text,
  cpv text[] not null default '{}',
  presupuesto numeric,
  organo text,
  provincia text,
  tipo_contrato text,
  estado text,
  fin_presentacion date,
  url text,
  fuente text not null default 'placsp',
  fts tsvector,
  actualizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_lic_fin on concursos_licitaciones (fin_presentacion);
create index if not exists idx_lic_cpv on concursos_licitaciones using gin (cpv);
create index if not exists idx_lic_fts on concursos_licitaciones using gin (fts);
