-- Vertical ALMACÉN — cimientos (Fase 2). BD compartida wswbehlcuxqxyinousql, schema public.
-- Aplicar como `postgres` (preview→prod). El rol prisma_almacen NO tiene CREATE.
-- Aditivo e idempotente. Ya aplicado por MCP el 2026-07-15.

CREATE TABLE IF NOT EXISTS almacen_familias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  negocio_id  uuid REFERENCES negocios(id) ON DELETE SET NULL,
  nombre      text NOT NULL,                 -- "Vajilla", "Cristalería", "Mantelería"…
  orden       int DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_familias_cuenta ON almacen_familias (cuenta_id);

CREATE TABLE IF NOT EXISTS almacen_materiales (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id            uuid NOT NULL REFERENCES cuentas(id) ON DELETE CASCADE,
  negocio_id           uuid REFERENCES negocios(id) ON DELETE SET NULL,
  familia_id           uuid REFERENCES almacen_familias(id) ON DELETE SET NULL,
  nombre               text NOT NULL,
  categoria            text NOT NULL DEFAULT 'otro',   -- espejo de module-materiales
  tipo                 text NOT NULL DEFAULT 'activo',  -- 'consumible' | 'activo'
  estado               text NOT NULL DEFAULT 'operativo',
  cantidad_total       int  NOT NULL DEFAULT 0,
  cantidad_disponible  int  NOT NULL DEFAULT 0,
  unidades_por_bandeja int  NOT NULL DEFAULT 1,         -- «RAKI» = bandeja de almacenaje
  stock_minimo         int,
  coste_reposicion     numeric(10,2) NOT NULL DEFAULT 0,
  precio_compra        numeric(10,2) NOT NULL DEFAULT 0,
  codigo               text,
  imagen_url           text,
  activo               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_almacen_materiales_cuenta  ON almacen_materiales (cuenta_id);
CREATE INDEX IF NOT EXISTS idx_almacen_materiales_familia ON almacen_materiales (familia_id);

-- Rol de BD dedicado (clon de prisma_sivra: login + BYPASSRLS + DML en public, sin CREATE).
-- Se crea inerte (sin password). Alberto luego: ALTER ROLE prisma_almacen WITH PASSWORD '…';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='prisma_almacen') THEN
    CREATE ROLE prisma_almacen WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO prisma_almacen;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prisma_almacen;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO prisma_almacen;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prisma_almacen;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO prisma_almacen;
