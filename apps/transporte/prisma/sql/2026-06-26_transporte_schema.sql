-- Vertical TRANSPORTE — esquema de datos (BD COMPARTIDA del holding, scope cuenta_id).
-- DOCUMENTADO, NO aplicado automáticamente. Se ejecuta a mano sobre una BD de preview/branch
-- primero y, tras OK de Alberto, en producción (es la misma Supabase que sivra/ialimp/plataforma).
--
-- Generaliza la flota a medida de ia-rest (`vehiculos_grupo` + `evento_transporte`) a tablas
-- propias de la vertical, con prefijos `flota_` / `transporte_`. No toca ninguna tabla existente.
-- El scope multi-tenant es por `cuenta_id` (FK a `cuentas`); el filtrado lo aplica la app en cada
-- query con la cuenta de la sesión (igual que plataforma: server-side, sin depender de RLS).

begin;

-- ─── Flota (operativa) ─────────────────────────────────────────────────────────
create table if not exists flota_vehiculos (
  id                   uuid primary key default gen_random_uuid(),
  cuenta_id            uuid not null references cuentas(id) on delete cascade,
  nombre               text not null,
  matricula            text,
  tipo                 text not null default 'camion',     -- furgon|camion|frigorifico|plataforma|turismo
  capacidad_kg         numeric,
  capacidad_m3         numeric,
  es_propio            boolean not null default true,      -- false = transportista subcontratado
  proveedor_transporte text,
  tarifa_km            numeric,                             -- € por km
  tarifa_fija          numeric,                             -- € fijos por porte
  activo               boolean not null default true,
  created_at           timestamptz not null default now()
);
create index if not exists idx_flota_vehiculos_cuenta on flota_vehiculos(cuenta_id);

create table if not exists flota_conductores (
  id                uuid primary key default gen_random_uuid(),
  cuenta_id         uuid not null references cuentas(id) on delete cascade,
  nombre            text not null,
  dni               text,
  permiso           text,                                  -- categorías (B, C, C+E, CAP…)
  caducidad_permiso date,
  telefono          text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists idx_flota_conductores_cuenta on flota_conductores(cuenta_id);

create table if not exists flota_documentos (
  id              uuid primary key default gen_random_uuid(),
  vehiculo_id     uuid not null references flota_vehiculos(id) on delete cascade,
  tipo            text not null,                           -- itv|seguro|permiso|tacografo
  fecha_emision   date,
  fecha_caducidad date not null,
  importe         numeric,
  documento_url   text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_flota_documentos_vehiculo on flota_documentos(vehiculo_id);

create table if not exists flota_mantenimientos (
  id          uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references flota_vehiculos(id) on delete cascade,
  fecha       date not null,
  km          numeric,
  tipo        text not null default 'revision',
  coste       numeric not null default 0,
  taller      text,
  notas       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_flota_mantenimientos_vehiculo on flota_mantenimientos(vehiculo_id);

create table if not exists flota_repostajes (
  id          uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references flota_vehiculos(id) on delete cascade,
  fecha       date not null,
  km          numeric,
  litros      numeric not null default 0,
  importe     numeric not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_flota_repostajes_vehiculo on flota_repostajes(vehiculo_id);

-- ─── Transporte (negocio) ──────────────────────────────────────────────────────
create table if not exists transporte_servicios (
  id                  uuid primary key default gen_random_uuid(),
  cuenta_id           uuid not null references cuentas(id) on delete cascade,
  encargo_id          uuid,                                -- Encargo del que cuelga (module-encargo)
  cliente_nombre      text,
  a_terceros          boolean not null default true,       -- false = interno (candidato intercompany)
  origen              text,
  destino             text,
  fecha               date not null default current_date,
  estado              text not null default 'presupuestado', -- presupuestado|planificado|en_curso|entregado|facturado|cancelado
  importe             numeric,                             -- precio de cierre (sin IVA)
  descuento_eur       numeric,
  notas               text,
  sociedad_origen_id  uuid,                                -- sociedad que PRESTA (ingreso)
  sociedad_destino_id uuid,                                -- sociedad que RECIBE (gasto)
  created_at          timestamptz not null default now()
);
create index if not exists idx_transporte_servicios_cuenta on transporte_servicios(cuenta_id);

create table if not exists transporte_portes (
  id                  uuid primary key default gen_random_uuid(),
  servicio_id         uuid references transporte_servicios(id) on delete set null,
  parent_id           uuid,                                -- entidad origen (evento/pedido/alquiler/porte)
  parent_type         text,
  vehiculo_id         uuid not null references flota_vehiculos(id),
  conductor_id        uuid references flota_conductores(id),
  estado              text not null default 'planificado', -- planificado|en_curso|completado|cancelado
  km_estimados        numeric,
  km_reales           numeric,
  coste_estimado      numeric,
  coste_real          numeric,
  importe_facturado   numeric,
  hora_salida         timestamptz,
  hora_llegada        timestamptz,
  es_interno          boolean not null default false,
  sociedad_origen_id  uuid,
  sociedad_destino_id uuid,
  created_at          timestamptz not null default now()
);
create index if not exists idx_transporte_portes_servicio on transporte_portes(servicio_id);
create index if not exists idx_transporte_portes_vehiculo on transporte_portes(vehiculo_id);

create table if not exists transporte_paradas (
  id             uuid primary key default gen_random_uuid(),
  porte_id       uuid not null references transporte_portes(id) on delete cascade,
  orden          int not null default 0,
  direccion      text,
  tipo           text not null default 'entrega',          -- recogida|entrega
  ventana_inicio timestamptz,
  ventana_fin    timestamptz,
  completada_at  timestamptz
);
create index if not exists idx_transporte_paradas_porte on transporte_paradas(porte_id);

commit;
