-- Demo GPS para la cuenta JJ: ruta geolocalizada Sevilla→Jerez (servicio "Bodega Real"),
-- token de conductor (enlace mágico) y token de seguimiento (cliente) + una posición reciente.
-- Idempotente. Ids fijos del seed de transporte.

-- Tokens (conductor + seguimiento del servicio a terceros Sevilla→Jerez)
UPDATE flota_conductores  SET acceso_token = 'jj-demo-conductor'
  WHERE id = '0de50000-0000-4000-a000-0000000b0001';
UPDATE transporte_servicios SET seguimiento_token = 'jj-demo-jerez'
  WHERE id = '0de50000-0000-4000-a000-0000000c0001';

-- Porte activo (para que aparezca en la app del conductor)
UPDATE transporte_portes SET estado = 'en_curso'
  WHERE id = '0de50000-0000-4000-a000-0000000d0001';

-- Ruta: 3 paradas con coordenadas (corredor Sevilla→Jerez)
DELETE FROM transporte_paradas
  WHERE porte_id = '0de50000-0000-4000-a000-0000000d0001' AND direccion LIKE '%[seed-gps]%';
INSERT INTO transporte_paradas (porte_id, orden, direccion, tipo, lat, lng) VALUES
  ('0de50000-0000-4000-a000-0000000d0001', 0, 'Cocina central, Sevilla [seed-gps]', 'recogida', 37.3886, -5.9823),
  ('0de50000-0000-4000-a000-0000000d0001', 1, 'Las Cabezas de San Juan [seed-gps]', 'entrega', 36.9800, -5.9400),
  ('0de50000-0000-4000-a000-0000000d0001', 2, 'Bodega Real, Jerez [seed-gps]', 'entrega', 36.6866, -6.1377);

-- Device GPS demo del vehículo (para probar la ingesta agnóstica de hardware):
--   GET /api/ingest/osmand?key=<FLOTA_INGEST_SECRET>&id=jj-demo-gps-01&lat=37.1&lon=-5.95&speed=40
UPDATE flota_vehiculos SET device_id = 'jj-demo-gps-01'
  WHERE id = '0de50000-0000-4000-a000-0000000a0001';

-- Posición reciente del vehículo (sale de Sevilla) para que el mapa muestre señal viva
DELETE FROM flota_posiciones WHERE vehiculo_id = '0de50000-0000-4000-a000-0000000a0001';
INSERT INTO flota_posiciones (vehiculo_id, porte_id, lat, lng, velocidad_kmh, capturado_at)
  VALUES ('0de50000-0000-4000-a000-0000000a0001', '0de50000-0000-4000-a000-0000000d0001', 37.30, -5.97, 78, now());
