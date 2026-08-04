-- Palanca de urgencia (last-minute) por piso.
--
-- Arranca APAGADA en los cuatro (0) a propósito: es una palanca que BAJA precios en vivo, así que
-- se enciende piso a piso y con OK explícito de Alberto, igual que `apply_enabled`. 1 = intensidad
-- plena (hasta -25% el día de entrada); valores intermedios raman el efecto.
--
-- La referencia de "cuándo toca" NO se configura aquí: se MIDE de `rate_snapshots` en cada pasada
-- (antelación mediana real de cada piso). Ver lib/sivra/pricing-lastminute.ts.
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS lastminute_k numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN pricing_settings.lastminute_k IS
  'Intensidad del descuento last-minute (0 = apagado, 1 = pleno). El motor mide la antelación mediana del piso en rate_snapshots y descuenta al acercarse la fecha sin venderse. Nunca sube; el suelo, el techo y el raíl diario siguen mandando.';
