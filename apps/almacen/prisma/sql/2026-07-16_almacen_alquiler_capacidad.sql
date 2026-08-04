-- Almacén: campos de catálogo de alquiler.
-- precio_alquiler = tarifa de alquiler (distinta de precio_compra).
-- capacidad = volumen o medidas de ficha ("56 cl", "Ø 30 cm", "Alto 74 cm, ...").
ALTER TABLE almacen_materiales
  ADD COLUMN IF NOT EXISTS precio_alquiler numeric(10,2),
  ADD COLUMN IF NOT EXISTS capacidad text;
