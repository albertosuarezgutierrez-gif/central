-- Motor fiscal (31/10/2026): datos que el motor necesita para cuadrar la renta y que no existían en BD.
--  · familia_numerosa_desde: fecha de INICIO del título de familia numerosa. La deducción estatal (art. 81 bis
--    LIRPF) se prorratea por meses con título vigente el último día del mes (renta 2025: título desde
--    18/11/2025 ⇒ 2 meses ⇒ 200€, casilla 0660). NULL = «sin dato» ⇒ la línea sale sin importe.
--  · abono_anticipado_maternidad / abono_anticipado_fn: cobrado por anticipado en el año (modelos 140/143;
--    casillas 0612/0661). Se suman al resultado de la declaración. NULL = no consta.
-- Lectura: lib/finanzas.ts usa `SELECT * FROM fiscal_perfil` ⇒ hasta aplicar esto llegan undefined (sin dato).
-- NO aplicada por el agente (sin escritura en BD): aplicarla y rellenar el valor de la cuenta de Alberto
-- (familia_numerosa_desde = fecha de inicio del título; abono_anticipado_maternidad del ejercicio en curso).
ALTER TABLE fiscal_perfil ADD COLUMN IF NOT EXISTS familia_numerosa_desde date;
ALTER TABLE fiscal_perfil ADD COLUMN IF NOT EXISTS abono_anticipado_maternidad numeric(10,2);
ALTER TABLE fiscal_perfil ADD COLUMN IF NOT EXISTS abono_anticipado_fn numeric(10,2);
COMMENT ON COLUMN fiscal_perfil.familia_numerosa_desde IS 'Inicio del título de familia numerosa (prorrateo por meses de la deducción estatal). NULL = sin dato.';
COMMENT ON COLUMN fiscal_perfil.abono_anticipado_maternidad IS 'Abono anticipado de maternidad cobrado en el ejercicio (modelo 140). NULL = no consta.';
COMMENT ON COLUMN fiscal_perfil.abono_anticipado_fn IS 'Abono anticipado de familia numerosa cobrado en el ejercicio (modelo 143). NULL = no consta.';
