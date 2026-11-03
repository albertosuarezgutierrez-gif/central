-- Qué CAPAS movieron el precio en cada escritura de `pricing_applied` (motor de pricing, apply).
-- Motivo (03/11/2026): el motor compone prima vie/sáb, factor dom-jue, raíl, suelos (coste,
-- estacional, vie/sáb y por fecha del propietario) y techos, y la fila solo guardaba el resultado.
-- Sin saber qué capa decidió cada noche no se puede atribuir el efecto de la prima de finde ni de
-- los suelos: había que estimarlo. Desde ahora cada fila lo deja anotado. Solo se ANOTA: ningún
-- precio cambia.
--
-- Semántica (ver lib/sivra/pricing-capa-final.ts → decidirCapaFinal):
--   · prima_finde        factor de prima vie/sáb aplicado a esa noche; NULL si no se aplicó o el
--                        piso no está en SIVRA_PRIMA_FINDE_PISOS;
--   · factor_semana      factor dom-jue de última hora aplicado (< 1); mismo criterio;
--   · suelo_propietario  suelo del propietario vigente esa noche (vie/sáb o por fecha, el mayor);
--   · capa_final         qué decidió el precio final: mercado | prima | suelo_finde | suelo_fecha |
--                        suelo_estacional | techo | rail | max_price | min_price.
--
-- ADITIVO: columnas nullable sin default → las filas antiguas quedan en NULL (= «no se anotó»).
-- ⚠️ El INSERT del apply ya las incluye: APLICAR ESTA MIGRACIÓN ANTES del deploy. Sin ellas el
-- INSERT falla (su catch es «no crítico») y se perdería toda la auditoría, incluido `ref24`.
-- ialimp no toca esta tabla.
ALTER TABLE pricing_applied
  ADD COLUMN IF NOT EXISTS prima_finde numeric,
  ADD COLUMN IF NOT EXISTS factor_semana numeric,
  ADD COLUMN IF NOT EXISTS suelo_propietario integer,
  ADD COLUMN IF NOT EXISTS capa_final text;

COMMENT ON COLUMN pricing_applied.prima_finde IS
  'Factor de prima vie/sáb aplicado a la noche. NULL = no se aplicó o piso fuera de la env.';
COMMENT ON COLUMN pricing_applied.factor_semana IS
  'Factor dom-jue (<1) aplicado a la noche. NULL = no se aplicó o piso fuera de la env.';
COMMENT ON COLUMN pricing_applied.suelo_propietario IS
  'Suelo del propietario vigente esa noche (min_price_finde o por fecha, el mayor). NULL = ninguno.';
COMMENT ON COLUMN pricing_applied.capa_final IS
  'Capa que decidió el precio: mercado|prima|suelo_finde|suelo_fecha|suelo_estacional|techo|rail|max_price|min_price.';
