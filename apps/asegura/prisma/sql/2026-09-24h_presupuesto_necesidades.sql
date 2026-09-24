-- 2026-09-24 — Exigencias y necesidades del cliente en el presupuesto (IDD / art. 20 Ley 16/2018:
-- antes de contratar, el distribuidor especifica las exigencias y necesidades del cliente a partir de
-- lo que este le cuenta). La escribe el corredor; el portal la enseña y la aceptación firmada la cita.
-- Sin ella el presupuesto no se avisa al cliente (lo comprueba `avisarPresupuesto`).
--
-- ADITIVA. Reversible: ALTER TABLE seguros.presupuesto DROP COLUMN necesidades, DROP COLUMN necesidades_at.

ALTER TABLE seguros.presupuesto
  ADD COLUMN IF NOT EXISTS necesidades    text,
  ADD COLUMN IF NOT EXISTS necesidades_at timestamptz;

ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_necesidades_coherentes;
ALTER TABLE seguros.presupuesto ADD CONSTRAINT presupuesto_necesidades_coherentes CHECK (
  (necesidades IS NULL) = (necesidades_at IS NULL)
  AND (necesidades IS NULL OR length(btrim(necesidades)) BETWEEN 15 AND 1500)
);

-- El portal la lee para enseñársela al cliente (es lo que firma).
GRANT SELECT (necesidades) ON seguros.presupuesto TO prisma_asegura_portal;
