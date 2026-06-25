-- Desglose de un cargo bancario entre varios pisos (reparto por porcentaje).
-- Caso de uso: lavandería/suministros que facturan en bloque sin separar por piso.
-- El reparto NO cambia la deducibilidad fiscal (el movimiento sigue contando entero como
-- turistico_pisos en /finanzas); solo alimenta el P&L por piso (/apartamentos/[id]).

CREATE TABLE IF NOT EXISTS movimiento_reparto (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id uuid NOT NULL REFERENCES movimientos_bancarios(id) ON DELETE CASCADE,
  propiedad     text NOT NULL,             -- properties.id (prop_house_sevillana, …)
  porcentaje    numeric NOT NULL,          -- 0..100, los del mismo movimiento suman ~100
  importe       numeric NOT NULL,          -- parte ABS del importe del cargo (cómodo para sumar)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (movimiento_id, propiedad)
);

CREATE INDEX IF NOT EXISTS idx_mov_reparto_mov  ON movimiento_reparto(movimiento_id);
CREATE INDEX IF NOT EXISTS idx_mov_reparto_prop ON movimiento_reparto(propiedad);

-- Marca de "este cargo está desglosado" para que la UI lo distinga.
ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS desglosado boolean NOT NULL DEFAULT false;
