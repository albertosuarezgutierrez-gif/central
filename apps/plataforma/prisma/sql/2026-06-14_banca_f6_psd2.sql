-- Banca F6 · Conexión automática PSD2 (Open Banking) vía GoCardless Bank Account Data
-- (antes Nordigen). Guarda la "requisition" (consentimiento) por sociedad. Los datos
-- (saldos/movimientos) aterrizan en las MISMAS cuentas_bancarias / movimientos_bancarios
-- de la F1. Tabla nueva, aditiva, scoped por cuenta_id. Se aplica por Supabase MCP.
-- Spec: docs/superpowers/specs/2026-06-14-consolidacion-bancaria-design.md

create table if not exists public.conexiones_banco (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references public.cuentas(id)    on delete cascade,
  sociedad_id     uuid not null references public.sociedades(id) on delete cascade,
  proveedor       text not null default 'gocardless',
  institution_id  text,                -- id del banco en GoCardless (p.ej. BBVA_BBVAESMM)
  institution_nombre text,
  requisition_id  text not null,       -- id del consentimiento
  estado          text not null default 'pendiente'  -- pendiente | vinculada | caducada | error
                  check (estado in ('pendiente','vinculada','caducada','error')),
  caduca_el       date,                -- los consentimientos PSD2 caducan (~90 días)
  ultimo_sync     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_conexiones_banco_cuenta on public.conexiones_banco (cuenta_id);
create unique index if not exists uq_conexiones_banco_req on public.conexiones_banco (requisition_id);

alter table public.conexiones_banco enable row level security;
