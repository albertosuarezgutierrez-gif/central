-- Coste del DINERO en las subastas (art. 670 LEC): parámetros del puente.
--
-- En una subasta no existe la «financiación sujeta a tasación»: hay 40 días para
-- consignar el resto del precio y ningún banco hipoteca un inmueble que todavía
-- no es tuyo. Quien no tiene el importe entero en caja necesita un préstamo
-- puente, y ese dinero cuesta intereses + comisión que no aparecen en ninguna
-- ficha y se comen el margen de un flip ajustado.
--
-- Se declara por CUENTA (no se inventa): sin `financia_pct` el coste puerta
-- abierta se calcula como hasta ahora, sin coste del dinero.
ALTER TABLE subastas_criterios
  ADD COLUMN IF NOT EXISTS financia_pct numeric,
  ADD COLUMN IF NOT EXISTS financia_tipo_anual numeric,
  ADD COLUMN IF NOT EXISTS financia_meses int,
  ADD COLUMN IF NOT EXISTS financia_comision numeric;

COMMENT ON COLUMN subastas_criterios.financia_pct IS
  'Parte del desembolso que se cubre con dinero prestado (0-1). NULL = se paga todo en efectivo y no se computa coste del dinero.';
COMMENT ON COLUMN subastas_criterios.financia_tipo_anual IS
  'Tipo nominal ANUAL del puente en tanto por uno (0.08 = 8%).';
COMMENT ON COLUMN subastas_criterios.financia_meses IS
  'Meses que dura el puente hasta refinanciar con hipoteca. NULL = 4 (art. 670 LEC + inscripción).';
COMMENT ON COLUMN subastas_criterios.financia_comision IS
  'Comisión de apertura del puente en tanto por uno sobre el importe prestado.';
