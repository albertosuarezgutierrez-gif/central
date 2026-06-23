-- Override MANUAL de la compañía aseguradora de un movimiento de la correduría.
-- La compañía normalmente se deduce del concepto (lib/correduria.ts::detectarCompania), pero los
-- ingresos que entran a 'seguros' por descarte no traen el nombre → caen en 'Otras'. Cuando el dueño
-- confirma que un movimiento ES de seguros, puede asignarle aquí la compañía para que la matriz lo
-- agrupe en su fila. NULL = sin asignar (se usa la detección automática / 'Otras').
ALTER TABLE movimientos_bancarios ADD COLUMN IF NOT EXISTS compania_seguros text;
