-- Localización GPS en vivo de la flota (vertical transporte).
-- Scope multi-tenant por cuenta_id (vía vehículo/servicio). Minimización de datos: solo lat/lng/ts.
-- Aplicar a mano como `postgres` (Supabase/MCP). Idempotente.

-- Posiciones (append-only). Cada lectura del móvil/baliza del vehículo.
CREATE TABLE IF NOT EXISTS flota_posiciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehiculo_id   uuid NOT NULL REFERENCES flota_vehiculos(id) ON DELETE CASCADE,
  porte_id      uuid REFERENCES transporte_portes(id) ON DELETE SET NULL,
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  velocidad_kmh double precision,
  rumbo         double precision,
  capturado_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flota_posiciones_veh_ts ON flota_posiciones (vehiculo_id, capturado_at DESC);
CREATE INDEX IF NOT EXISTS idx_flota_posiciones_porte ON flota_posiciones (porte_id);

-- Enlace mágico del conductor (app de campo sin gestionar usuarios).
ALTER TABLE flota_conductores ADD COLUMN IF NOT EXISTS acceso_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_flota_conductores_token
  ON flota_conductores (acceso_token) WHERE acceso_token IS NOT NULL;

-- Enlace público de seguimiento para el cliente (tipo Glovo).
ALTER TABLE transporte_servicios ADD COLUMN IF NOT EXISTS seguimiento_token text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transporte_servicios_seg_token
  ON transporte_servicios (seguimiento_token) WHERE seguimiento_token IS NOT NULL;

-- Coordenadas opcionales de cada parada (para dibujar la ruta en el mapa).
ALTER TABLE transporte_paradas ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE transporte_paradas ADD COLUMN IF NOT EXISTS lng double precision;
