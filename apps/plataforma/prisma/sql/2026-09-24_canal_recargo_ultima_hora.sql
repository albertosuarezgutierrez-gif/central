-- Tramo de última hora del canal (24/09/2026).
--
-- En Luxury Busto y Busto Reform el escaparate de Booking tiene DOS rectas según la antelación
-- (R² = 1,000 en las dos, 45 días de ventanas): con check-in a ≤6 días la pendiente sube ~11 % y
-- la cuota fija no se mueve. Una sola recta ajustada sobre las dos mezcladas (Luxury: 0,987 × base
-- + 64,1€) dejaba las fechas con antelación ~14 % por debajo del objetivo del motor.
--
-- La recta principal (`channel_markup`, `cuota_fija`) pasa a ajustarse solo con ventanas de
-- antelación, y el tramo corto es un RECARGO sobre su pendiente. 1 = sin tramo, que es el
-- comportamiento de siempre: la columna nace neutra y la escribe el calibrador
-- (`/api/sivra/pricing/canal`) cuando mide ≥3 ventanas de última hora.

ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS canal_recargo_uh numeric NOT NULL DEFAULT 1
  CONSTRAINT pricing_settings_recargo_uh_cordura CHECK (canal_recargo_uh BETWEEN 0.8 AND 1.4);
