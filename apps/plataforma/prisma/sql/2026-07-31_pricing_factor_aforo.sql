-- Factor de AFORO para normalizar comparables de mercado al tamaño real del piso.
--
-- Hallazgo 31/07/2026 (aviso de Alberto sobre Socorro/House Sevillana): el barrido guardaba los
-- mismos comps de 4 plazas para los 4 pisos y el motor calculaba sus percentiles SIN mirar `guests`,
-- así que una casa de 12 plazas se tarificaba contra apartamentos de 4-8 y salía a mitad de precio.
--
-- El exponente NO es inventado: se midió sobre `market_rates` comparando el p50 de la MISMA fecha con
-- aforos distintos (entre fechas distintas mandaría la temporada, no el aforo). House 8 plazas frente
-- a Dúplex 4 plazas en 12 fechas independientes da un ratio medio de 2,20 al doblar plazas (k≈1,14);
-- House 12 frente a Luxury 5 en 2 fechas da 2,52 para 2,4x plazas (k≈1,06). Se toma k = 1,1.
--
-- GEMELA EXACTA de `lib/sivra/pricing-aforo.ts::factorAforo` (mismo exponente y mismas cotas). Si se
-- cambia una, hay que cambiar la otra: la de TS es la testeada y la que documenta el porqué.
CREATE OR REPLACE FUNCTION pricing_factor_aforo(plazas_piso numeric, plazas_comp numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    -- Sin datos o mismo aforo: no se toca el precio (nunca inventamos un ajuste).
    WHEN plazas_piso IS NULL OR plazas_comp IS NULL
      OR plazas_piso <= 0 OR plazas_comp <= 0
      OR plazas_piso = plazas_comp THEN 1::numeric
    ELSE LEAST(2.5::numeric, GREATEST(0.6::numeric,
      POWER(plazas_piso::numeric / plazas_comp::numeric, 1.1::numeric)))
  END
$$;

COMMENT ON FUNCTION pricing_factor_aforo(numeric, numeric) IS
  'Normaliza el precio de un comparable al aforo del piso propio. Gemela de lib/sivra/pricing-aforo.ts::factorAforo (k=1,1; cotas 0,6-2,5).';
