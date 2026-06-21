-- Radar PLACSP (F7): matches captados por empresa, con dedupe e idempotencia.
create table if not exists concursos_radar_anuncios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  dedupe_key text not null,
  anuncio jsonb not null,
  puntuacion int not null default 0,
  motivos jsonb not null default '[]',
  visto boolean not null default false,
  created_at timestamptz not null default now(),
  unique (empresa_id, dedupe_key)
);
create index if not exists idx_radar_anuncios_empresa
  on concursos_radar_anuncios (empresa_id, created_at desc);
