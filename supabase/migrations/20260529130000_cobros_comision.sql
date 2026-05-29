-- ia.rest cobros — repercutir comisión al invitado (opcional por portal)
-- repercutir_comision: si true, el precio mostrado al invitado incluye 2.5% (1.5% Stripe + 1% ia.rest)

ALTER TABLE cobros_grupo
  ADD COLUMN IF NOT EXISTS repercutir_comision boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cobros_grupo.repercutir_comision IS 'Si true, el precio al invitado se incrementa un 2.5% (1.5% Stripe + 1% ia.rest). Si false, el cliente absorbe las comisiones del precio base.';
