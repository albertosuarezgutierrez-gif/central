-- Almacén Fase 2: eventos y alquileres.
-- El stock por almacén gana 2 estados: reservado (comprometido a un evento,
-- ya no disponible para nadie) y fuera (entregado, pendiente de devolución).
-- Ciclo: confirmar (disponible→reservado) → entregar (reservado→fuera) →
-- devolver (fuera→disponible; roturas se pierden).

ALTER TABLE almacen_stock ADD COLUMN IF NOT EXISTS reservado integer NOT NULL DEFAULT 0 CHECK (reservado >= 0);
ALTER TABLE almacen_stock ADD COLUMN IF NOT EXISTS fuera integer NOT NULL DEFAULT 0 CHECK (fuera >= 0);

CREATE TABLE IF NOT EXISTS almacen_eventos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL,
  tipo             text NOT NULL DEFAULT 'evento',      -- evento | alquiler
  titulo           text NOT NULL,
  cliente_nombre   text,
  cliente_contacto text,
  lugar            text,
  fecha_inicio     date NOT NULL,
  fecha_fin        date NOT NULL,
  estado           text NOT NULL DEFAULT 'presupuesto', -- presupuesto|confirmado|entregado|devuelto|cerrado|cancelado
  notas            text,
  creado_por       text,
  created_at       timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS almacen_eventos_cuenta_idx ON almacen_eventos (cuenta_id);
CREATE INDEX IF NOT EXISTS almacen_eventos_fechas_idx ON almacen_eventos (fecha_inicio, fecha_fin);

CREATE TABLE IF NOT EXISTS almacen_evento_lineas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id    uuid NOT NULL,
  evento_id    uuid NOT NULL REFERENCES almacen_eventos (id) ON DELETE CASCADE,
  material_id  uuid NOT NULL REFERENCES almacen_materiales (id) ON DELETE RESTRICT,
  espacio_id   uuid NOT NULL REFERENCES almacen_espacios (id) ON DELETE RESTRICT,
  cantidad     integer NOT NULL CHECK (cantidad > 0),
  entregada    integer NOT NULL DEFAULT 0,
  devuelta     integer NOT NULL DEFAULT 0,
  danada       integer NOT NULL DEFAULT 0,
  created_at   timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS almacen_evento_lineas_evento_idx ON almacen_evento_lineas (evento_id);
CREATE INDEX IF NOT EXISTS almacen_evento_lineas_material_idx ON almacen_evento_lineas (material_id);

ALTER TABLE almacen_movimientos ADD COLUMN IF NOT EXISTS evento_id uuid REFERENCES almacen_eventos (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS almacen_movimientos_evento_idx ON almacen_movimientos (evento_id);

GRANT ALL ON almacen_eventos, almacen_evento_lineas TO prisma_almacen;
