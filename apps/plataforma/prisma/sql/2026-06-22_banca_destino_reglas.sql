-- Reglas de aprendizaje del "destino"/negocio de un movimiento por clave de referencia.
-- Simétrica a correduria_reglas (que aprende la COMPAÑÍA dentro de seguros): ésta aprende a qué
-- NEGOCIO pertenece un movimiento (personal, pisos, dúplex, traspaso, seguros). Cuando el dueño
-- saca un movimiento de seguros ("No es de seguros"), se guarda aquí su código (p.ej. el DNI de la
-- pensión) → destino, y los movimientos con ese código (pasados y futuros) se clasifican solos.
-- El código (que puede ser dato personal, como un DNI) vive aquí en BD, NUNCA en el repo.
CREATE TABLE IF NOT EXISTS banca_destino_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL,
  clave text NOT NULL,
  destino text NOT NULL,
  creado_at timestamptz DEFAULT now(),
  UNIQUE (cuenta_id, clave)
);
