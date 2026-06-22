-- Reglas de aprendizaje de la correduría: clave de referencia → compañía aseguradora.
-- Cuando el dueño asigna a mano la compañía de un movimiento, se guarda aquí una regla con el
-- código de referencia del concepto (M1454, M00171, 8/92361…) para que la matriz/detalle
-- clasifiquen solos todos los movimientos (pasados y futuros) con ese mismo código.
-- Scope por cuenta_id (la app filtra siempre por cuenta vía cuentas_bancarias).
CREATE TABLE IF NOT EXISTS correduria_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL,
  clave text NOT NULL,
  compania text NOT NULL,
  creado_at timestamptz DEFAULT now(),
  UNIQUE (cuenta_id, clave)
);
