-- Almacén Fase 1: capa operativa multi-almacén.
-- Almacenes (espacios) + libro de movimientos (ledger) + stock por almacén
-- (snapshot) + transferencias con estado en tránsito + hilo de comentarios.
-- BD compartida wswbehlcuxqxyinousql; rol de la vertical: prisma_almacen.

-- ── Almacenes / espacios ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS almacen_espacios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id         uuid NOT NULL,
  nombre            text NOT NULL,
  tipo              text NOT NULL DEFAULT 'otro',   -- central | hacienda | otro
  direccion         text,
  persona_contacto  text,
  telefono          text,
  email             text,
  notas             text,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS almacen_espacios_cuenta_idx ON almacen_espacios (cuenta_id);

-- ── Transferencias (traspaso de 1 material entre 2 almacenes) ──────────────
CREATE TABLE IF NOT EXISTS almacen_transferencias (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id          uuid NOT NULL,
  material_id        uuid NOT NULL REFERENCES almacen_materiales (id) ON DELETE RESTRICT,
  espacio_origen_id  uuid NOT NULL REFERENCES almacen_espacios (id) ON DELETE RESTRICT,
  espacio_destino_id uuid NOT NULL REFERENCES almacen_espacios (id) ON DELETE RESTRICT,
  cantidad           integer NOT NULL CHECK (cantidad > 0),
  estado             text NOT NULL DEFAULT 'pendiente', -- pendiente | recibida | parcial | cancelada
  creado_por         text,
  notas              text,
  created_at         timestamptz(6) NOT NULL DEFAULT now(),
  recibida_at        timestamptz(6)
);
CREATE INDEX IF NOT EXISTS almacen_transferencias_cuenta_idx ON almacen_transferencias (cuenta_id);
CREATE INDEX IF NOT EXISTS almacen_transferencias_estado_idx ON almacen_transferencias (estado);

-- ── Stock por (material, almacén) — foto rápida ───────────────────────────
CREATE TABLE IF NOT EXISTS almacen_stock (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id    uuid NOT NULL,
  material_id  uuid NOT NULL REFERENCES almacen_materiales (id) ON DELETE CASCADE,
  espacio_id   uuid NOT NULL REFERENCES almacen_espacios (id) ON DELETE CASCADE,
  disponible   integer NOT NULL DEFAULT 0 CHECK (disponible >= 0),
  en_transito  integer NOT NULL DEFAULT 0 CHECK (en_transito >= 0),
  updated_at   timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE (material_id, espacio_id)
);
CREATE INDEX IF NOT EXISTS almacen_stock_cuenta_idx ON almacen_stock (cuenta_id);
CREATE INDEX IF NOT EXISTS almacen_stock_espacio_idx ON almacen_stock (espacio_id);

-- ── Libro de movimientos (ledger) — verdad histórica ──────────────────────
CREATE TABLE IF NOT EXISTS almacen_movimientos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id          uuid NOT NULL,
  material_id        uuid NOT NULL REFERENCES almacen_materiales (id) ON DELETE CASCADE,
  tipo               text NOT NULL, -- entrada | salida | devolucion | rotura | ajuste | transferencia
  cantidad           integer NOT NULL CHECK (cantidad <> 0),
  espacio_origen_id  uuid REFERENCES almacen_espacios (id) ON DELETE SET NULL,
  espacio_destino_id uuid REFERENCES almacen_espacios (id) ON DELETE SET NULL,
  transferencia_id   uuid REFERENCES almacen_transferencias (id) ON DELETE SET NULL,
  motivo             text,
  realizado_por      text,
  fecha              timestamptz(6) NOT NULL DEFAULT now(),
  created_at         timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS almacen_movimientos_cuenta_idx ON almacen_movimientos (cuenta_id);
CREATE INDEX IF NOT EXISTS almacen_movimientos_material_idx ON almacen_movimientos (material_id, fecha DESC);
CREATE INDEX IF NOT EXISTS almacen_movimientos_transf_idx ON almacen_movimientos (transferencia_id);

-- ── Comentarios (hilo de registro polimórfico) ────────────────────────────
CREATE TABLE IF NOT EXISTS almacen_comentarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL,
  entidad_tipo  text NOT NULL, -- espacio | material | transferencia | evento(futuro)
  entidad_id    uuid NOT NULL,
  autor         text NOT NULL,
  texto         text NOT NULL,
  foto_url      text,
  created_at    timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS almacen_comentarios_entidad_idx ON almacen_comentarios (entidad_tipo, entidad_id);
CREATE INDEX IF NOT EXISTS almacen_comentarios_cuenta_idx ON almacen_comentarios (cuenta_id);

-- ── Grants a la vertical ──────────────────────────────────────────────────
GRANT ALL ON almacen_espacios, almacen_transferencias, almacen_stock,
             almacen_movimientos, almacen_comentarios TO prisma_almacen;
