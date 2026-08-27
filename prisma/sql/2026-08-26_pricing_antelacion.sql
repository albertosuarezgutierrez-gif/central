-- Palanca de ANTICIPACIÓN por piso — el espejo del last-minute (ver lib/sivra/pricing-antelacion.ts).
--
-- Motivo (26/08/2026): el motor sabía BAJAR el precio cuando la fecha se acerca sin venderse, pero
-- nada lo SUBÍA por estar lejos. El 8-9 de enero de 2027 se vendió el 26/08/2026 —a 135 días vista,
-- casi 5× la antelación mediana de House en enero (28 días)— a precio de enero corriente.
--
-- Nació APAGADA en los cuatro (0), igual que `lastminute_k`, porque mueve precios en vivo. Alberto la
-- encendió en los CUATRO el 27/08/2026 con `antelacion_k = 1` (intensidad plena: hasta +25% a 4× la
-- antelación mediana del mes, nunca antes del día 60); los valores intermedios raman el efecto.
--
-- 🚨 El suelo de 60 días de `pricing-antelacion.ts` es lo que hace que esto signifique lo mismo en los
-- cuatro pisos: Busto Reform y Dúplex Center venden con 12 días de mediana típica, así que sin él el
-- tope caería en el día 48 y TODO su calendario más allá de mes y medio quedaría al +25% fijo.
--
-- La referencia de "qué es lejos" NO se configura aquí: se MIDE en cada pasada del histórico real de
-- reservas (`incomes.reserved_at`), por piso Y POR MES.
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS antelacion_k numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN pricing_settings.antelacion_k IS
  'Intensidad del premio por anticipación (0 = apagado, 1 = pleno). El motor mide la antelación mediana del piso PARA ESE MES en incomes.reserved_at y sube el precio de las fechas que están mucho más lejos de lo normal. Nunca baja; el raíl diario, el suelo de coste y el techo de mercado medido siguen mandando.';

-- Trazabilidad: el factor que la palanca aplicó a cada noche, en la fila de auditoría que ya existe.
-- NULL a propósito = "no se midió" (pasadas anteriores a esta columna, o palanca apagada), que NO es
-- lo mismo que 1.00 = "se evaluó y no tocaba premio". Sin esa distinción, el medidor de resultados
-- contaría como "sin premio" las noches de todo el histórico anterior y diría que la palanca no sirve.
ALTER TABLE pricing_applied
  ADD COLUMN IF NOT EXISTS antelacion_factor numeric;

COMMENT ON COLUMN pricing_applied.antelacion_factor IS
  'Factor de anticipación aplicado a esa noche (1.00 = evaluado sin premio, >1 = premio, NULL = no se midió). Es el factor PROPUESTO por la palanca: el raíl de ±%/día, los suelos y el techo de mercado pueden haberlo recortado aguas abajo.';

-- Para el medidor de resultados: las noches con premio se buscan por fecha y piso.
CREATE INDEX IF NOT EXISTS pricing_applied_antelacion_idx
  ON pricing_applied (property_id, rate_date)
  WHERE antelacion_factor > 1;
