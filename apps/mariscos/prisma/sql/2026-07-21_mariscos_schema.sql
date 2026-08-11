-- Vertical MARISCOS (Mariscos González) — esquema de datos (BD COMPARTIDA del holding, scope cuenta_id).
-- DOCUMENTADO. Se ejecuta a mano (preview → prod tras OK). No toca ninguna tabla existente.
-- Fase 1: trazabilidad pesquera + envasado por lote de origen. Prefijo `mariscos_`.

begin;

-- Partida = recepción de género con TODOS los datos del albarán. Ancla de trazabilidad.
create table if not exists mariscos_partidas (
  id                 uuid primary key default gen_random_uuid(),
  cuenta_id          uuid not null references cuentas(id) on delete cascade,
  producto           text not null,                 -- denominación comercial ("Gamba blanca")
  nombre_cientifico  text,                           -- obligatorio al consumidor (Regl. UE 1379/2013)
  proveedor          text,                           -- lonja / empresa de los barcos
  lote_origen        text not null,                  -- nº de lote CON EL QUE ENTRA (se conserva a la venta)
  albaran            text,                           -- nº de albarán del proveedor
  marea              text,                           -- salida de pesca
  barco              text,                           -- barco que lo capturó
  zona_captura       text,                           -- zona FAO / caladero
  arte_pesca         text,                           -- arte de pesca (arrastre, cerco…)
  metodo_produccion  text,                           -- capturado | capturado_agua_dulce | criado
  fecha_captura      date,
  fecha_recepcion    date not null default now(),
  fecha_caducidad    date,
  calibre            text,                           -- p. ej. "40/60" (condiciona el precio)
  peso_recibido_kg   numeric not null default 0,     -- kg que entran en cámara
  precio_compra_kg   numeric,                        -- € / kg de compra
  precio_venta_kg    numeric,                        -- € / kg de venta (según calibre)
  estado             text not null default 'en_camara', -- en_camara | agotada
  notas              text,
  created_at         timestamptz not null default now()
);
create index if not exists idx_mariscos_partidas_cuenta on mariscos_partidas(cuenta_id);

-- Envasado = unidad de venta re-envasada. HEREDA el lote de la partida (no genera uno nuevo).
create table if not exists mariscos_envasados (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references cuentas(id) on delete cascade,
  partida_id      uuid not null references mariscos_partidas(id) on delete cascade,
  canal           text not null default 'mostrador', -- mostrador | catering | hotel
  peso_kg         numeric not null default 0,        -- peso del envase (manual en Fase 1)
  precio_kg       numeric not null default 0,        -- € / kg aplicado
  importe         numeric not null default 0,        -- peso_kg * precio_kg (snapshot)
  fecha_envasado  date not null default now(),
  fecha_caducidad date,
  cliente         text,                              -- destino (catering/hotel)
  codigo          text,                              -- código único del envase
  created_at      timestamptz not null default now()
);
create index if not exists idx_mariscos_envasados_cuenta on mariscos_envasados(cuenta_id);
create index if not exists idx_mariscos_envasados_partida on mariscos_envasados(partida_id);

commit;
