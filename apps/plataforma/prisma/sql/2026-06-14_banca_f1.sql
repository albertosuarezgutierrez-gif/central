-- Banca F1 · Consolidación bancaria (importar Norma 43 + saldo consolidado).
-- Núcleo en plataforma. Tablas nuevas, aditivas, scoped por cuenta_id/sociedad_id.
-- Se aplica en la BD compartida (wswbehlcuxqxyinousql) vía Supabase MCP.
-- Spec: docs/superpowers/specs/2026-06-14-consolidacion-bancaria-design.md

-- Una cuenta bancaria de una sociedad (origen del extracto). El conector PSD2 (F6)
-- rellenará esta MISMA tabla; por eso `iban` admite tanto el CCC del N43 como un IBAN real.
create table if not exists public.cuentas_bancarias (
  id            uuid primary key default gen_random_uuid(),
  cuenta_id     uuid not null references public.cuentas(id)    on delete cascade,
  sociedad_id   uuid not null references public.sociedades(id) on delete cascade,
  banco         text,
  iban          text not null,          -- CCC (N43) o IBAN (PSD2). Clave de casado.
  iban_mascara  text,                   -- para mostrar (****1234)
  alias         text,
  divisa        text not null default 'EUR',
  saldo_actual  numeric(14,2),
  saldo_fecha   date,
  created_at    timestamptz not null default now(),
  unique (sociedad_id, iban)
);
create index if not exists idx_cuentas_bancarias_cuenta   on public.cuentas_bancarias (cuenta_id);
create index if not exists idx_cuentas_bancarias_sociedad on public.cuentas_bancarias (sociedad_id);

-- Un apunte bancario. dedupe_hash garantiza idempotencia al reimportar el mismo extracto.
create table if not exists public.movimientos_bancarios (
  id                  uuid primary key default gen_random_uuid(),
  cuenta_bancaria_id  uuid not null references public.cuentas_bancarias(id) on delete cascade,
  fecha_operacion     date,
  fecha_valor         date,
  importe             numeric(14,2) not null,   -- negativo = cargo, positivo = abono
  saldo_posterior     numeric(14,2),
  concepto            text,
  contraparte         text,
  referencia          text,
  origen              text not null default 'norma43',
  dedupe_hash         text not null,
  -- Columnas para fases siguientes (nullable ahora):
  concepto_normalizado text,   -- F2: concepto legible
  categoria            text,   -- F2: etiqueta (proveedor, nómina, impuestos…)
  categoria_pgc        text,   -- F2: cuenta del plan contable
  conciliado           boolean not null default false,  -- F3
  factura_ref          text,   -- F3/F4: factura/ingreso casado
  analizado_at         timestamptz,                     -- F2: cuándo lo procesó la IA
  created_at           timestamptz not null default now(),
  unique (cuenta_bancaria_id, dedupe_hash)
);
create index if not exists idx_movimientos_bancarios_cuenta on public.movimientos_bancarios (cuenta_bancaria_id, fecha_operacion);

-- RLS activado (sin políticas): plataforma accede por Prisma (rol postgres, salta RLS);
-- el rol anon/authenticated de la Data API queda bloqueado. Mismo posture que cuentas/sociedades.
alter table public.cuentas_bancarias    enable row level security;
alter table public.movimientos_bancarios enable row level security;
