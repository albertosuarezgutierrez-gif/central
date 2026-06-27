-- Vertical ALQUILER de materiales — esquema de datos (BD COMPARTIDA del holding, scope cuenta_id).
-- DOCUMENTADO. Se ejecuta a mano (preview → prod tras OK). No toca ninguna tabla existente.
-- Mapea el agregado Alquiler de @central/module-alquiler. Prefijo `alquiler_`.

begin;

create table if not exists alquiler_materiales (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  nombre      text not null,
  categoria   text,
  stock_total int not null default 0,
  tarifa_dia  numeric not null default 0,   -- € por unidad y día
  tarifa_fija numeric,                       -- € por unidad (flat, ignora días) — opcional
  fianza_unit numeric,                       -- depósito por unidad — opcional
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_alquiler_materiales_cuenta on alquiler_materiales(cuenta_id);

create table if not exists alquiler_alquileres (
  id                    uuid primary key default gen_random_uuid(),
  cuenta_id             uuid not null references cuentas(id) on delete cascade,
  encargo_id            uuid,                              -- Encargo del que cuelga (module-encargo)
  cliente_nombre        text,
  a_terceros            boolean not null default true,     -- false = interno (candidato intercompany)
  fecha_inicio          date not null,
  fecha_fin             date not null,
  estado                text not null default 'reservado', -- reservado|entregado|devuelto|cancelado
  fianza                numeric,
  descuento_eur         numeric,
  fecha_devolucion_real date,                              -- si > fecha_fin → recargo por retraso
  notas                 text,
  sociedad_origen_id    uuid,                              -- sociedad que ALQUILA (ingreso)
  sociedad_destino_id   uuid,                              -- sociedad que USA (gasto)
  created_at            timestamptz not null default now()
);
create index if not exists idx_alquiler_alquileres_cuenta on alquiler_alquileres(cuenta_id);

create table if not exists alquiler_lineas (
  id          uuid primary key default gen_random_uuid(),
  alquiler_id uuid not null references alquiler_alquileres(id) on delete cascade,
  material_id uuid not null references alquiler_materiales(id),
  nombre      text not null,
  cantidad    int not null default 1,
  tarifa_dia  numeric not null default 0,
  tarifa_fija numeric
);
create index if not exists idx_alquiler_lineas_alquiler on alquiler_lineas(alquiler_id);
create index if not exists idx_alquiler_lineas_material on alquiler_lineas(material_id);

commit;
