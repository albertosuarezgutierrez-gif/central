-- F0.1 · Comunicación multi-negocio (red interna casa de marcas).
-- Núcleo en plataforma. Tablas nuevas, aditivas, scoped por cuenta_id.
-- Aplicada en la BD compartida (wswbehlcuxqxyinousql) vía Supabase MCP.
-- Diseño: docs/COMUNICACION-MULTINEGOCIO.md · Troceo: docs/COMUNICACION-F0-PLAN.md

-- Grupos/secciones de destinatarios (estáticos o dinámicos).
create table if not exists public.comunicacion_grupos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  negocio_id  uuid references public.negocios(id) on delete cascade,
  nombre      text not null,
  tipo        text not null default 'estatico' check (tipo in ('estatico','dinamico')),
  origen_ref  text,  -- para dinámicos, p.ej. 'iarest:evento:<id>'
  created_at  timestamptz not null default now()
);
create index if not exists idx_comunicacion_grupos_cuenta on public.comunicacion_grupos (cuenta_id);

-- Miembros de un grupo estático (persona/rol dentro de un negocio).
create table if not exists public.comunicacion_grupo_miembros (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.comunicacion_grupos(id) on delete cascade,
  negocio_id  uuid references public.negocios(id) on delete cascade,
  ref_persona text,
  rol         text
);
create index if not exists idx_comunicacion_grupo_miembros_grupo on public.comunicacion_grupo_miembros (grupo_id);

-- Nodos direccionables: el dueño (cuenta), un negocio, un grupo o una persona.
create table if not exists public.comunicacion_nodos (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  tipo        text not null check (tipo in ('cuenta','negocio','grupo','persona')),
  negocio_id  uuid references public.negocios(id) on delete cascade,
  grupo_id    uuid references public.comunicacion_grupos(id) on delete cascade,
  ref_persona text,  -- id de la persona en su vertical (no FK: vive en otra app)
  rol         text,
  nombre      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_comunicacion_nodos_cuenta on public.comunicacion_nodos (cuenta_id);

-- Categorías de conversación libres (definidas por el dueño).
create table if not exists public.comunicacion_categorias (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references public.cuentas(id) on delete cascade,
  nombre      text not null,
  color       text,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_comunicacion_categorias_cuenta on public.comunicacion_categorias (cuenta_id);

-- Matriz de reglas (quién puede mensajear/encargar a quién). El dueño es la autoridad.
create table if not exists public.comunicacion_reglas (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references public.cuentas(id) on delete cascade,
  origen_nodo_id  uuid not null references public.comunicacion_nodos(id) on delete cascade,
  destino_nodo_id uuid not null references public.comunicacion_nodos(id) on delete cascade,
  puede_mensajear boolean not null default true,
  puede_encargar  boolean not null default false,
  categoria_ids   uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index if not exists idx_comunicacion_reglas_cuenta on public.comunicacion_reglas (cuenta_id);

-- Conversaciones y mensajes.
create table if not exists public.comunicacion_conversaciones (
  id                 uuid primary key default gen_random_uuid(),
  cuenta_id          uuid not null references public.cuentas(id) on delete cascade,
  categoria_id       uuid references public.comunicacion_categorias(id) on delete set null,
  titulo             text,
  creado_por_nodo_id uuid references public.comunicacion_nodos(id) on delete set null,
  estado             text not null default 'abierta' check (estado in ('abierta','cerrada','archivada')),
  created_at         timestamptz not null default now()
);
create index if not exists idx_comunicacion_conversaciones_cuenta on public.comunicacion_conversaciones (cuenta_id);

create table if not exists public.comunicacion_conversacion_participantes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.comunicacion_conversaciones(id) on delete cascade,
  nodo_id         uuid not null references public.comunicacion_nodos(id) on delete cascade,
  rol             text,
  unique (conversacion_id, nodo_id)
);

create table if not exists public.comunicacion_mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.comunicacion_conversaciones(id) on delete cascade,
  autor_nodo_id   uuid references public.comunicacion_nodos(id) on delete set null,
  cuerpo          text not null,
  adjuntos        jsonb not null default '[]'::jsonb,
  leido_por       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_comunicacion_mensajes_conv on public.comunicacion_mensajes (conversacion_id, created_at);
