-- Tabla de leads del formulario de contacto de la landing
-- Fase 1: contacto manual. Fase 2: migrar a auto-registro.

create table if not exists leads (
  id          uuid        default gen_random_uuid() primary key,
  nombre      text        not null,
  restaurante text        not null,
  telefono    text        not null,
  notas       text,
  estado      text        not null default 'nuevo' check (estado in ('nuevo','contactado','demo','cliente','descartado')),
  created_at  timestamptz default now()
);

-- RLS: solo service role puede leer/escribir (la EF usa service role)
alter table leads enable row level security;

-- Sin políticas públicas: acceso exclusivo vía service role desde la EF
-- Para ver leads: /super panel o Supabase dashboard
