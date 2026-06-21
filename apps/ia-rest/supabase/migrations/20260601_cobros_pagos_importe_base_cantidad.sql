-- ia.rest cobros — columnas que el checkout ya intentaba escribir pero no existían
-- Sin ellas, el INSERT en cobros_grupo_pagos fallaba silenciosamente: el invitado
-- pagaba en Stripe pero no quedaba registro, y el panel mostraba 0 pagados / 0 cobrado.
-- importe_base_eur: importe sin la comisión repercutida (precio base * cantidad)
-- cantidad: nº de unidades del menú/ítem en este pago

ALTER TABLE cobros_grupo_pagos
  ADD COLUMN IF NOT EXISTS importe_base_eur numeric,
  ADD COLUMN IF NOT EXISTS cantidad integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN cobros_grupo_pagos.importe_base_eur IS 'Importe base sin comisión repercutida (precio_eur del item * cantidad). importe_eur incluye la comisión si repercutir_comision = true.';
COMMENT ON COLUMN cobros_grupo_pagos.cantidad IS 'Número de unidades del item cobradas en este pago.';
