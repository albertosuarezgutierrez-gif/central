-- 09/08/2026 — decisión de Alberto (dos palancas que quedaban abiertas tras la baja de PriceLabs):
--
-- 1) SIN techo de precio (max_price se queda NULL en los 4 pisos), a propósito:
--    «no tope! final copa rey hay q aprovechar!! … siempre hay tiempo de ir bajando precio».
--    Un evento fuerte debe poder subir sin límite; el raíl de ±%/día permite deshacer a tiempo.
--    NO proponer techos de nuevo salvo que Alberto cambie de opinión.
--
-- 2) Last-minute ENCENDIDO en los 4 pisos (lastminute_k = 0.5 → descuento máx. 12,5% el día de
--    entrada, curva cuadrática desde la antelación MEDIANA por piso/mes). Condición de Alberto:
--    «que ganemos dinero, si no prefiero no vender esa noche» — garantizada por orden de aplicación
--    en apply/route.ts: el descuento va ANTES del suelo de coste (min_price), del suelo estacional
--    y del raíl, y las noches de evento (factor ≥1,15) no se rebajan nunca.
--
-- 3) Suelo estacional encendido también en Dúplex y House (venían a 0 del dry-run bajo PL):
--    sin él, la urgencia podría deslizar una fecha de temporada alta hasta el suelo base,
--    justo lo contrario del «teniendo en cuenta costes y temporada».
--
-- APLICADO en prod el 09/08/2026 (~16:00 UTC) vía Supabase MCP. Este archivo es el registro.
UPDATE pricing_settings SET lastminute_k = 0.5;
UPDATE pricing_settings SET seasonal_floor_k = 1
 WHERE property_id IN ('prop_duplex_center', 'prop_house_sevillana');
