-- Agente SEO autónomo — tablas de datos (schema iarest)
-- Todos los cambios del agente son DATOS aquí; nunca tocan código.

create table if not exists iarest.seo_overrides (
  id          uuid primary key default gen_random_uuid(),
  ruta        text not null unique,
  title       text,
  description text,
  canonical   text,
  og          jsonb,
  jsonld      jsonb,
  activo      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default 'seo-agent'
);

create table if not exists iarest.seo_content_blocks (
  id         uuid primary key default gen_random_uuid(),
  ruta       text not null,
  posicion   int  not null,
  titulo     text,
  html       text not null,
  activo     boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (ruta, posicion)
);
create index if not exists seo_content_blocks_ruta_idx on iarest.seo_content_blocks (ruta) where activo;

create table if not exists iarest.seo_articulos (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  titulo          text not null,
  meta_description text,
  keyword         text,
  bloques         jsonb not null default '[]'::jsonb,
  activo          boolean not null default true,
  published_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists iarest.seo_cambios (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null,
  ruta          text not null,
  tipo          text not null,            -- 'metadata' | 'schema' | 'content_block' | 'articulo'
  valor_antes   jsonb,
  valor_despues jsonb,
  motivo        text,
  created_at    timestamptz not null default now()
);
create index if not exists seo_cambios_ruta_fecha_idx on iarest.seo_cambios (ruta, created_at desc);
