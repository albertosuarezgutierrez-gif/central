-- El riesgo como pantalla (29/09/2026, diseño docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md).
-- Aplicada como migración `seguros_riesgo_figuras`.
--
-- 1. Figuras vigentes del riesgo: quién es tomador, propietario, conductor habitual y ocasional.
--    Cada figura es una FICHA (cliente_id), nunca texto: agrupar por identidad. Sin fila de
--    tomador, el tomador es oportunidades.cliente_id (todas las oportunidades de antes de hoy).
-- 2. oportunidades.poliza_id: el riesgo que YA es póliza nuestra (renovación). Hasta hoy vivía
--    como info_riesgo->>'polizaId'; se rellena desde ahí.
-- 3. tarificaciones.figuras: la foto de figuras de ESA variante. NULL = no consta (anterior a
--    hoy), nunca «el cliente». tarificaciones.nota: etiqueta libre del corredor.

create table if not exists seguros.oportunidad_figura (
  id              uuid primary key default gen_random_uuid(),
  correduria_id   uuid not null references seguros.corredurias(id),
  oportunidad_id  uuid not null references seguros.oportunidades(id) on delete cascade,
  rol             text not null,
  cliente_id      uuid not null references seguros.clientes(id),
  creado_at       timestamptz not null default now(),
  actor           text not null,
  constraint oportunidad_figura_rol_ck check (rol in ('tomador', 'propietario', 'conductor_habitual', 'conductor_ocasional'))
);

-- Una persona por rol (el vendor solo admite un conductor ocasional en auto y ninguno en moto).
create unique index if not exists oportunidad_figura_rol_uq on seguros.oportunidad_figura (oportunidad_id, rol);
create index if not exists oportunidad_figura_cliente_idx on seguros.oportunidad_figura (cliente_id);

comment on table seguros.oportunidad_figura is
  'Figuras vigentes del riesgo de una oportunidad (29/09/2026). Sin fila de tomador, el tomador es oportunidades.cliente_id.';

grant select, insert, update, delete on seguros.oportunidad_figura to prisma_seguros;

alter table seguros.oportunidades add column if not exists poliza_id uuid references seguros.polizas(id);
create index if not exists oportunidades_poliza_idx on seguros.oportunidades (poliza_id) where poliza_id is not null;
comment on column seguros.oportunidades.poliza_id is
  'Póliza nuestra sobre la que se trabaja este riesgo (renovación/retarificación). NULL = riesgo nuevo o de la competencia.';

update seguros.oportunidades o set poliza_id = (o.info_riesgo->>'polizaId')::uuid
where o.poliza_id is null
  and o.info_riesgo->>'polizaId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (select 1 from seguros.polizas p where p.id = (o.info_riesgo->>'polizaId')::uuid and p.correduria_id = o.correduria_id);

alter table seguros.tarificaciones
  add column if not exists figuras jsonb,
  add column if not exists nota text;
comment on column seguros.tarificaciones.figuras is
  'Foto de figuras de esta variante: {tomador, propietario, conductor_habitual, conductor_ocasional} → cliente_id o null (= el tomador). NULL la columna = no consta.';
comment on column seguros.tarificaciones.nota is 'Etiqueta libre del corredor para esta variante («a nombre del padre»).';
