-- Actividad de Pilar (cónyuge autónoma): etiquetado de cuentas + datos fiscales + subcategoría
-- 2026-06-23

-- 1. Titular de la cuenta bancaria: 'titular' = Alberto, 'conyuge' = Pilar
ALTER TABLE cuentas_bancarias
  ADD COLUMN IF NOT EXISTS titular TEXT NOT NULL DEFAULT 'titular';

-- 2. Datos fiscales del cónyuge autónoma (overrides manuales o calculados del extracto)
ALTER TABLE fiscal_perfil
  ADD COLUMN IF NOT EXISTS conyuge_es_autonomo       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conyuge_ingresos_brutos   DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS conyuge_gastos_deducibles DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS conyuge_cuota_autonomos   DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS conyuge_retenciones       DECIMAL(14,2);

-- 3. Subcategoría dentro de actividad_pilar (cobro_cliente, cuota_autonomos, gasto_profesional)
ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS subcategoria TEXT;
