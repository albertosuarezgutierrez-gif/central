-- ia.rest cobros de grupo — comisión configurable por restaurante + ahorro de costes (05/06/2026)
-- Las columnas de comisión son nullable: si están a NULL, el código usa los defaults de
-- plataforma (lib/cobros-comision.ts → PLATAFORMA_DEFAULT). Así la app nunca depende de
-- que la fila esté completa.

-- Comisión por restaurante (cobros de grupo)
ALTER TABLE cobro_config
  ADD COLUMN IF NOT EXISTS comision_pct        numeric(5,3),   -- % sobre el precio base (ej. 2.0)
  ADD COLUMN IF NOT EXISTS comision_fija_eur   numeric(6,2),   -- fijo por pago en € (ej. 0.35)
  ADD COLUMN IF NOT EXISTS minimo_producto_eur numeric(8,2);   -- precio mínimo por producto (ej. 3.00)

COMMENT ON COLUMN cobro_config.comision_pct IS 'Comisión ia.rest % sobre base (cobros de grupo). NULL = default plataforma';
COMMENT ON COLUMN cobro_config.comision_fija_eur IS 'Comisión ia.rest fija por pago en € (cobros de grupo). NULL = default plataforma';
COMMENT ON COLUMN cobro_config.minimo_producto_eur IS 'Precio mínimo por producto en portales de cobro. NULL = default plataforma';

-- Idempotencia del email de cierre al dueño
ALTER TABLE cobros_grupo
  ADD COLUMN IF NOT EXISTS email_cierre_enviado boolean NOT NULL DEFAULT false;

-- Idempotencia del recordatorio a invitados con el pago a medias
ALTER TABLE cobros_grupo_pagos
  ADD COLUMN IF NOT EXISTS recordatorio_enviado_at timestamptz;
