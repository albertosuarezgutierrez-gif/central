-- Cola de avisos al operador para el resumen diario por email.
-- tgAlert() (canal 'resumen', por defecto) acumula aquí; el cron
-- /api/cron/avisos-resumen envía UN email al día con lo pendiente y marca enviado.
-- Aplicada 20/07/2026 al proyecto vivo efncqyvhniaxsirhdxaa (schema public).
-- Al hacer el flip a la BD compartida (schema iarest), reaplicar allí.
create table if not exists public.avisos_operador (
  id uuid primary key default gen_random_uuid(),
  nivel text not null default 'info',        -- info | aviso | critico | resuelto
  mensaje text not null,
  restaurante_id uuid,
  enviado boolean not null default false,
  enviado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_avisos_operador_pendientes
  on public.avisos_operador (enviado, created_at);

alter table public.avisos_operador enable row level security;

drop policy if exists "service_role_all" on public.avisos_operador;
create policy "service_role_all" on public.avisos_operador
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
