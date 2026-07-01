-- Permite ocultar cuentas bancarias de la vista consolidada (sin borrarlas).
ALTER TABLE cuentas_bancarias ADD COLUMN IF NOT EXISTS oculta BOOLEAN NOT NULL DEFAULT FALSE;
