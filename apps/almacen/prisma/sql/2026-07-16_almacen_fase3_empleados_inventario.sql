-- Almacén Fase 3: empleados (creados por la oficina, con acceso propio) e
-- inventario por conteo (sesión por almacén; al cerrar genera ajustes/roturas).
CREATE TABLE IF NOT EXISTS almacen_empleados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL,
  nombre        text NOT NULL,
  usuario       text NOT NULL,
  password_hash text NOT NULL,
  telefono      text,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, usuario)
);
CREATE INDEX IF NOT EXISTS almacen_empleados_cuenta_idx ON almacen_empleados (cuenta_id);
CREATE INDEX IF NOT EXISTS almacen_empleados_usuario_idx ON almacen_empleados (lower(usuario));

CREATE TABLE IF NOT EXISTS almacen_inventarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id   uuid NOT NULL,
  espacio_id  uuid NOT NULL REFERENCES almacen_espacios (id) ON DELETE RESTRICT,
  empleado_id uuid REFERENCES almacen_empleados (id) ON DELETE SET NULL,
  estado      text NOT NULL DEFAULT 'abierto',
  ciego       boolean NOT NULL DEFAULT true,
  notas       text,
  created_at  timestamptz(6) NOT NULL DEFAULT now(),
  cerrado_at  timestamptz(6),
  cerrado_por text
);
CREATE INDEX IF NOT EXISTS almacen_inventarios_cuenta_idx ON almacen_inventarios (cuenta_id);
CREATE INDEX IF NOT EXISTS almacen_inventarios_espacio_idx ON almacen_inventarios (espacio_id);

CREATE TABLE IF NOT EXISTS almacen_inventario_lineas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL,
  inventario_id    uuid NOT NULL REFERENCES almacen_inventarios (id) ON DELETE CASCADE,
  material_id      uuid NOT NULL REFERENCES almacen_materiales (id) ON DELETE CASCADE,
  cantidad_sistema integer NOT NULL,
  cantidad_contada integer,
  foto_url         text,
  ajuste_generado  boolean NOT NULL DEFAULT false,
  UNIQUE (inventario_id, material_id)
);
CREATE INDEX IF NOT EXISTS almacen_inventario_lineas_inv_idx ON almacen_inventario_lineas (inventario_id);

GRANT ALL ON almacen_empleados, almacen_inventarios, almacen_inventario_lineas TO prisma_almacen;
