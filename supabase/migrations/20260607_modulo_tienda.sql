-- ============================================================
-- 20260607_modulo_tienda.sql — Vertical Retail (Fase C), capa de datos mínima
-- ============================================================
-- Tras leer el esquema REAL del remoto, productos YA tiene: ean_codigo (código de
-- barras), venta_por_peso, precio_por_kg y stock directo (stock_actual, stock_minimo,
-- unidad_stock, modo_reposicion). Y comandas YA tiene columna `tipo` (texto libre,
-- sin CHECK). Por tanto la venta de tienda se modela como comanda con tipo='tienda'
-- reutilizando todo el núcleo de cobro/factura, y aquí SOLO falta:
--   1) marcar qué productos forman el catálogo de tienda (modo 'separado')
--   2) índice para búsqueda rápida por EAN
--   3) configuración de tienda por local (hardware + modo catálogo)
--
-- DECISIÓN: el descuento de stock en la venta se hace en CÓDIGO (ruta
-- /api/tienda/venta), NO en un trigger sobre comanda_items — esa tabla es el
-- hot-path de TODAS las comandas del sistema y no debe cargarse con lógica retail.
-- Idempotente. Columnas en español. (restaurante_id se renombrará a local_id en la
-- migración de núcleo de la Fase A; el DO-block de rename barrerá también estas.)

-- 1. Marca de producto de tienda (para modo_catalogo='separado')
alter table productos
  add column if not exists es_tienda boolean not null default false;

-- 2. Índice de búsqueda por código de barras (no único: puede haber EAN repetidos hoy)
create index if not exists idx_productos_ean
  on productos(restaurante_id, ean_codigo)
  where ean_codigo is not null;

-- 3. Configuración de tienda por local (hardware adaptable + modo catálogo)
create table if not exists config_tienda (
  restaurante_id  uuid primary key references restaurantes(id) on delete cascade,
  modo_catalogo   text    not null default 'mismo',    -- 'mismo' | 'separado'
  barcode_activo  boolean not null default false,
  barcode_modo    text    not null default 'usb',      -- 'usb' | 'camara' | 'ambos'
  bascula_activa  boolean not null default false,
  solo_tactil     boolean not null default true,
  descontar_stock boolean not null default true,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table config_tienda enable row level security;

-- Multi-tenant (patrón del proyecto: current_setting('app.restaurante_id'))
drop policy if exists config_tienda_rls on config_tienda;
create policy config_tienda_rls on config_tienda
  using      (restaurante_id = current_setting('app.restaurante_id', true)::uuid)
  with check (restaurante_id = current_setting('app.restaurante_id', true)::uuid);

-- Service role (Edge Functions / server) acceso total
drop policy if exists config_tienda_service on config_tienda;
create policy config_tienda_service on config_tienda
  using (auth.role() = 'service_role');
