-- 2026-09-04 — auto-resolución de alertas de pricing.
--
-- `pricing_alerts` no tenía camino de cierre: `pushAlert` no recrea un aviso mientras siga abierto,
-- pero nadie lo marcaba `resuelta` al desaparecer la causa. Medido el 04/09/2026: 107 abiertas, 54
-- de tipo `precio_revertido` desde el 10/08, y 51 de esas 54 YA cuadraban.
--
-- Estas dos columnas separan «lo cerró el guardián porque el problema desapareció» de «lo cerró
-- Alberto». Sin esa distinción, `resuelta` mezcla un hecho comprobado con una decisión humana y
-- deja de poder auditarse por qué se cerró algo.
ALTER TABLE pricing_alerts
  ADD COLUMN IF NOT EXISTS resuelta_at  timestamptz,
  ADD COLUMN IF NOT EXISTS resuelta_por text;

COMMENT ON COLUMN pricing_alerts.resuelta_por IS
  'quién la cerró: ''auto'' = el guardián comprobó que la condición ya no se cumple; NULL en las cerradas a mano antes de 09/2026';

-- Índice para la consulta de auto-resolución (abiertas por tipo).
CREATE INDEX IF NOT EXISTS pricing_alerts_abiertas_tipo_idx
  ON pricing_alerts (tipo, property_id, fecha_ref) WHERE resuelta = false;
