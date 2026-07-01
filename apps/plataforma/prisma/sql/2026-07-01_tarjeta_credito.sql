-- Tarjeta de crédito: distinguir tipo de cuenta bancaria.
-- Permite importar extractos mensuales de tarjeta de crédito con el mismo flujo
-- que los extractos de cuenta corriente, clasificados y visibles en /finanzas/tarjeta-credito.
ALTER TABLE public.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'corriente'
    CHECK (tipo IN ('corriente', 'tarjeta', 'ahorro'));
