-- Vigilancia de pujas EN VIVO de las subastas seguidas (08/08/2026).
-- `mejor_puja` = mejor puja publicada por la ficha del portal en la última
-- consulta; NULL = no publicada/sin consultar (el portal no siempre la enseña —
-- NO es «sin pujas»). `mejor_puja_at` = cuándo se miró por última vez.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS mejor_puja numeric;
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS mejor_puja_at timestamptz;

-- Dedupe del aviso «ya pujan por encima de tu techo» (una vez por seguimiento).
ALTER TABLE subastas_seguidas ADD COLUMN IF NOT EXISTS sobrepuja_avisada_at timestamptz;

COMMENT ON COLUMN subastas.mejor_puja IS
  'Mejor puja publicada por la ficha del portal en la última consulta del cron subastas-cierre. NULL = no publicada o sin consultar (no es «sin pujas»).';
