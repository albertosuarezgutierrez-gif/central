-- 2026-08-15 — Reconstruir la referencia PriceLabs con la última curva PL REAL.
--
-- La congelación del 14/08 (2026-08-14_pl_referencia_congelada.sql) re-etiquetó `captured_at` a
-- '2026-08-10' pero NO restauró los PRECIOS: el upsert autorreferente siguió corriendo hasta el
-- despliegue del PR #1416, así que las filas re-capturadas el 11-14/08 conservaron los precios del
-- PROPIO motor (verificado contra pricing_applied: Busto 15/08 "PL"=449 es el write del motor del
-- 11/08 08:31; el PL real de Dúplex 15/08 era 95€ y el de House 450€ en el snapshot del 08/08).
-- Con el suelo al 85% sobre esa curva, la noche del 15/08 un piso de 2 plazas pedía 359€ con la
-- mediana fiable de su fecha en 77€, y toda la curva hasta ago-2027 quedaba blindada a −15% del
-- sawtooth del motor.
--
-- Qué es "PL real" por piso (medido contra pricing_applied, primer write vivo del motor):
--   · prop_busto_reform  → motor en vivo desde el 10/06/2026  ┐ la tabla nació el 18/07: NUNCA
--   · prop_luxury_busto  → motor en vivo desde el 13/07/2026  ┘ contuvo PL genuino → se BORRAN.
--   · prop_duplex_center → motor desde el 08/08 14:30 ┐ el snapshot diario corre a las 07:00 UTC →
--   · prop_house_sevillana → motor desde 08/08 14:30  ┘ la foto de rate_snapshots del 08/08 es PL puro.
--
-- Idempotente. APLICADA por Supabase MCP el 15/08/2026.

-- Busto/Luxury: sin curva PL genuina en la vida de la tabla → suelo PL inerte para ellos
-- (les protegen min_price, suelo estacional, ancla de fecha y prior histórico).
DELETE FROM pricing_pl_referencia
WHERE property_id IN ('prop_busto_reform', 'prop_luxury_busto');

-- Dúplex/House: reponer la última foto PL limpia (snapshot 2026-08-08, 07:00 UTC).
UPDATE pricing_pl_referencia p
SET pl_price = s.price_pricelabs, captured_at = '2026-08-08'
FROM rate_snapshots s
WHERE s.property_id = p.property_id
  AND s.rate_date = p.rate_date
  AND s.snapshot_date = '2026-08-08'
  AND s.price_pricelabs > 0
  AND p.property_id IN ('prop_duplex_center', 'prop_house_sevillana');

-- Filas sin foto limpia del 08/08 (p. ej. rate_date > 2027-08-08, fuera del horizonte de ese
-- snapshot): sin dato real no hay referencia — se borran, no se inventan.
DELETE FROM pricing_pl_referencia p
WHERE p.property_id IN ('prop_duplex_center', 'prop_house_sevillana')
  AND NOT EXISTS (
    SELECT 1 FROM rate_snapshots s
    WHERE s.property_id = p.property_id
      AND s.rate_date = p.rate_date
      AND s.snapshot_date = '2026-08-08'
      AND s.price_pricelabs > 0
  );
