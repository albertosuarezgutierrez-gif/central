-- Control de deducciones de cuota IRPF en movimientos bancarios.
-- Tres tipos: mecenazgo (Ley 49/2002), guardería (Art.81bis LIRPF), deportiva Andalucía (D.A.1ª Ley 7/2021).

ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS deduccion_cuota_tipo TEXT;

ALTER TABLE banca_destino_reglas
  ADD COLUMN IF NOT EXISTS deduccion_cuota_tipo TEXT;

ALTER TABLE fiscal_perfil
  ADD COLUMN IF NOT EXISTS gasto_deportivo_anual NUMERIC(10,2) DEFAULT 0;

COMMENT ON COLUMN movimientos_bancarios.deduccion_cuota_tipo IS
  'mecenazgo | guarderia | deportiva_and — reduce cuota IRPF (no base imponible)';
COMMENT ON COLUMN banca_destino_reglas.deduccion_cuota_tipo IS
  'Regla aprendida de deducción de cuota para esta clave de comercio/referencia';
COMMENT ON COLUMN fiscal_perfil.gasto_deportivo_anual IS
  'Gasto deportivo anual (base para deducción 15% Andalucía D.A.1ª Ley 7/2021, máx €100)';
