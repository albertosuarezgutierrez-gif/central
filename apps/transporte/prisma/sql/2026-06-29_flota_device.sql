-- Identificador de hardware GPS por vehículo (capa de ingesta agnóstica del fabricante).
-- Cada cliente conecta el tracker que quiera (móvil del conductor, baliza OBD-II, Teltonika,
-- Concox, un servidor Traccar…): basta con que el aparato mande su posición a /api/ingest/<formato>
-- identificándose con este `device_id` (IMEI / uniqueId). La posición entra en `flota_posiciones`
-- como cualquier otra y el mapa/geocerca/ETA/km reales funcionan igual.
-- Aplicar a mano como `postgres` (preview primero, prod tras OK).

ALTER TABLE flota_vehiculos ADD COLUMN IF NOT EXISTS device_id text;

-- Un device_id apunta como mucho a un vehículo (los IMEI son únicos globalmente). El scope de
-- cuenta se deriva del vehículo → la ingesta no necesita saber la cuenta, solo el aparato.
CREATE UNIQUE INDEX IF NOT EXISTS flota_vehiculos_device_id_key
  ON flota_vehiculos (device_id)
  WHERE device_id IS NOT NULL;
