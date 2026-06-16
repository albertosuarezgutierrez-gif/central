-- Pasarela de IA central (casa de marcas): registro de uso para control de coste/observabilidad.
-- Las apps llaman a /api/ai/* de plataforma con Bearer AI_GATEWAY_SECRET; cada llamada se registra aquí.
create table if not exists public.ai_usos (
  id uuid primary key default gen_random_uuid(),
  app text not null,
  endpoint text not null,          -- 'chat' | 'search'
  proveedor text not null,         -- 'nim' | 'gemini' | ...
  modelo text,
  ok boolean not null default true,
  ms integer not null default 0,
  error text,
  creada_at timestamptz not null default now()
);
create index if not exists ai_usos_creada_idx on public.ai_usos(creada_at);
create index if not exists ai_usos_app_idx on public.ai_usos(app);
