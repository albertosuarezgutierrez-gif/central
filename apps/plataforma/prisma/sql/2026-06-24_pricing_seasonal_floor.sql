-- Guard estacional del motor de pricing (apply): suelo dinámico por temporada.
-- Motivo (caso Busto abril'27): cuando los comps de un mes caducan, el motor pierde el bucket,
-- cae al global bajo y el precio se desliza hasta min_price → vende una semana de temporada alta
-- a precio de suelo (Apr 10-13 vendida a 94€ con mercado real ~150€). El suelo estacional
-- (min_price × FLOOR_SEASONAL[mes], ver lib/pricing-calendar.ts) impide ese deslizamiento sin
-- depender de que el mercado esté fresco.
--
-- ADITIVO y seguro: k=0 (default) → comportamiento idéntico al actual. ialimp no toca esta tabla.
ALTER TABLE pricing_settings
  ADD COLUMN IF NOT EXISTS seasonal_floor_k numeric NOT NULL DEFAULT 0;
