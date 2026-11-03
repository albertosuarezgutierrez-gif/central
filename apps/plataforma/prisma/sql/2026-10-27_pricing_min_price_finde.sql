-- Suelo de FIN DE SEMANA del propietario para el motor de pricing (apply).
-- Motivo (27/10/2026, House Sevillana): la reserva de Booking del 30/04-02/05/2027 (vie+sáb, 10 adultos)
-- dejó 1.081,13€ netos de portal → 486€/noche tras la limpieza (90€ + IVA por salida); el motor
-- había bajado la base de 608 a 576 el día antes. min_price (300) es un suelo de COSTE, de martes
-- de enero; el finde necesita el suyo, fijado por el dueño y no derivado del mercado.
--
-- Semántica (ver lib/sivra/pricing-suelo-finde.ts → sueloFindePropietario):
--   · solo noches de VIERNES y SÁBADO (la noche que empieza ese día);
--   · en BASE (sin channel_markup ni cuota_fija), igual que min_price;
--   · se aplica después de primas, raíl y techos de mercado/ADR; solo max_price le gana;
--   · NULL = sin efecto (comportamiento idéntico al actual).
--
-- ADITIVO y seguro: columna nullable sin default → ningún piso cambia al aplicarla. Activarla para
-- un piso es un UPDATE aparte y explícito. El apply la lee por to_jsonb(s), así que el orden
-- código/migración no rompe nada. ialimp no toca esta tabla.
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS min_price_finde integer;

COMMENT ON COLUMN pricing_settings.min_price_finde IS
  'Suelo en base (sin markup) para noches vie/sáb. NULL = sin efecto. Solo max_price le gana.';
