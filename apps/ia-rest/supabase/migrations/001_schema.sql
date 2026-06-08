-- ============================================================
-- ia.rest · Supabase Schema
-- ============================================================

-- CAMAREROS
CREATE TABLE IF NOT EXISTS camareros (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  pin        text NOT NULL,
  activo     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
INSERT INTO camareros (nombre, pin) VALUES
  ('Juan Martin', '1234'),
  ('Ana Lopez',   '5678'),
  ('Demo',        '0000')
ON CONFLICT DO NOTHING;

-- TURNOS
CREATE TABLE IF NOT EXISTS turnos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  fecha      date DEFAULT CURRENT_DATE,
  estado     text DEFAULT 'activo' CHECK (estado IN ('activo','cerrado')),
  created_at timestamptz DEFAULT now()
);
INSERT INTO turnos (nombre) VALUES ('Turno demo') ON CONFLICT DO NOTHING;

-- MESAS
CREATE TABLE IF NOT EXISTS mesas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo         text UNIQUE NOT NULL,
  zona           text DEFAULT 'salon' CHECK (zona IN ('salon','terraza','barra')),
  capacidad      int DEFAULT 4,
  estado         text DEFAULT 'libre' CHECK (estado IN ('libre','activa','marchar','aviso','urgente','cuenta')),
  camarero_id    uuid REFERENCES camareros(id),
  ocupada_desde  timestamptz,
  ultima_comanda timestamptz,
  updated_at     timestamptz DEFAULT now()
);
INSERT INTO mesas (codigo, zona, capacidad) VALUES
  ('T01','salon',4),('T02','salon',2),('T03','salon',4),('T04','salon',6),
  ('T05','salon',4),('T06','salon',4),('T07','salon',6),('T08','salon',8),
  ('T09','salon',2),('T10','salon',4),('T11','salon',4),('T12','salon',2),
  ('B01','barra',1),('B02','barra',1),('B03','barra',1),
  ('P01','terraza',4),('P02','terraza',4),('P03','terraza',6),('P04','terraza',2)
ON CONFLICT (codigo) DO NOTHING;

-- COMANDAS
CREATE TABLE IF NOT EXISTS comandas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mesa_id        uuid REFERENCES mesas(id),
  camarero_id    uuid REFERENCES camareros(id),
  turno_id       uuid REFERENCES turnos(id),
  estado         text DEFAULT 'nueva' CHECK (estado IN ('nueva','en_cocina','lista','entregada','cancelada','cerrada')),
  tipo           text DEFAULT 'comanda' CHECK (tipo IN ('comanda','cuenta','marchar','86','aviso')),
  numero_ticket  bigint GENERATED ALWAYS AS IDENTITY,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- COMANDA ITEMS
CREATE TABLE IF NOT EXISTS comanda_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id  uuid REFERENCES comandas(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  cantidad    int DEFAULT 1,
  notas       text,
  estado      text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_proceso','listo')),
  created_at  timestamptz DEFAULT now()
);

-- TRANSCRIPCIONES
CREATE TABLE IF NOT EXISTS transcripciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camarero_id     uuid REFERENCES camareros(id),
  turno_id        uuid REFERENCES turnos(id),
  texto_original  text,
  texto_brain     jsonb,
  latencia_ms     int,
  comanda_id      uuid REFERENCES comandas(id),
  created_at      timestamptz DEFAULT now()
);

-- PRODUCTOS 86
CREATE TABLE IF NOT EXISTS productos_86 (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  turno_id   uuid REFERENCES turnos(id),
  created_at timestamptz DEFAULT now()
);

-- REALTIME: enable for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE mesas, comandas, comanda_items, transcripciones, productos_86, turnos;

-- RLS: disable for now (MVP - add later)
ALTER TABLE camareros      DISABLE ROW LEVEL SECURITY;
ALTER TABLE turnos         DISABLE ROW LEVEL SECURITY;
ALTER TABLE mesas          DISABLE ROW LEVEL SECURITY;
ALTER TABLE comandas       DISABLE ROW LEVEL SECURITY;
ALTER TABLE comanda_items  DISABLE ROW LEVEL SECURITY;
ALTER TABLE transcripciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE productos_86   DISABLE ROW LEVEL SECURITY;
