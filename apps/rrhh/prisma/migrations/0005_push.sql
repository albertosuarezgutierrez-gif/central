-- Suscripciones Web Push. suscriptor = 'gestor' (responsable RR.HH.) o 'titular' (empleado).
create table rrhh.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references rrhh.empresas(id),
  suscriptor_tipo text not null,
  suscriptor_id uuid,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creada_at timestamptz not null default now()
);
create index push_subs_empresa_idx on rrhh.push_subscriptions(empresa_id);

alter table rrhh.push_subscriptions enable row level security;
