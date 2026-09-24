-- pricing_applied: los cuatro números que faltaban para poder auditar una decisión.
--
-- Por qué (04/09/2026): House Sevillana bajó un 20% y volvió a subir un 39% el mismo día, en dos
-- pasadas distintas. Al mirar las dos filas, TODO lo registrado era idéntico —`base_fuente`,
-- `demanda_fuente`, `demanda_gateada`, `antelacion_factor`— y aun así el resultado era opuesto.
-- Con lo que la tabla guarda hoy ese diagnóstico es IMPOSIBLE, no difícil: el objetivo antes de
-- acotarlo, las dos puntas del clamp y el ancla del raíl no se persistían en ninguna parte.
--
-- `rail_ancla_origen` no es adorno: el ancla del ±max_change_pct sale de ref24 (ayer), del primer
-- precio de hoy o del precio vivo, y solo en el primer caso el tope es DIARIO. Sin el origen, dos
-- escrituras que suman más del ±20% en un día son indistinguibles de un raíl roto.
--
-- Todas NULL-ables a propósito: las filas viejas no tienen estos datos y `NULL` significa
-- «no se registró», nunca 0. Rellenarlas con un valor inventado sería peor que el hueco.
ALTER TABLE pricing_applied
  ADD COLUMN IF NOT EXISTS target_crudo      integer,   -- objetivo ANTES del clamp (baseD)
  ADD COLUMN IF NOT EXISTS clamp_floor       integer,   -- punta baja del clamp de calidad
  ADD COLUMN IF NOT EXISTS clamp_ceil        integer,   -- punta alta
  ADD COLUMN IF NOT EXISTS rail_ancla        integer,   -- desde dónde se midió el ±max_change_pct
  ADD COLUMN IF NOT EXISTS rail_ancla_origen text;      -- 'ref24' | 'primero_hoy' | 'actual'

COMMENT ON COLUMN pricing_applied.target_crudo IS
  'Objetivo del motor ANTES de acotarlo (baseD). NULL = fila anterior al 04/09/2026, no 0.';
COMMENT ON COLUMN pricing_applied.rail_ancla_origen IS
  'Fuente del ancla del raíl. Solo ref24 hace que el tope sea por DÍA; con actual es por pasada.';
