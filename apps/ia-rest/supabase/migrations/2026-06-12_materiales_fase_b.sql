-- ============================================================
-- Materiales Fase B — Kits, Clientes, Proveedores,
-- Inventario físico, Mantenimiento, Reservas
-- BD: ia-rest (efncqyvhniaxsirhdxaa)
-- ============================================================

CREATE TABLE IF NOT EXISTS materiales_proveedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  nombre text NOT NULL,
  contacto text, telefono text, email text, nif text,
  plazo_entrega_dias int, notas text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_prov_restaurante ON materiales_proveedores (restaurante_id);
ALTER TABLE materiales_proveedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_proveedores;
CREATE POLICY service_role_all ON materiales_proveedores
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

ALTER TABLE materiales ADD COLUMN IF NOT EXISTS proveedor_id uuid REFERENCES materiales_proveedores(id);

CREATE TABLE IF NOT EXISTS materiales_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  nombre text NOT NULL,
  empresa text, nif text, telefono text, email text, notas text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_cli_restaurante ON materiales_clientes (restaurante_id);
ALTER TABLE materiales_clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_clientes;
CREATE POLICY service_role_all ON materiales_clientes
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS materiales_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  nombre text NOT NULL, descripcion text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_kits_restaurante ON materiales_kits (restaurante_id);
ALTER TABLE materiales_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_kits;
CREATE POLICY service_role_all ON materiales_kits
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS materiales_kits_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES materiales_kits(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  cantidad int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_mat_kits_items_kit ON materiales_kits_items (kit_id);
ALTER TABLE materiales_kits_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_kits_items;
CREATE POLICY service_role_all ON materiales_kits_items
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS materiales_inventario_fisico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  espacio_id uuid REFERENCES materiales_espacios(id),
  estado text NOT NULL DEFAULT 'borrador',
  realizado_por uuid,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_inv_restaurante ON materiales_inventario_fisico (restaurante_id);
ALTER TABLE materiales_inventario_fisico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_inventario_fisico;
CREATE POLICY service_role_all ON materiales_inventario_fisico
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS materiales_inventario_fisico_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventario_id uuid NOT NULL REFERENCES materiales_inventario_fisico(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  cantidad_sistema int NOT NULL DEFAULT 0,
  cantidad_contada int NOT NULL DEFAULT 0,
  ajuste_generado boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_mat_inv_lineas_inv ON materiales_inventario_fisico_lineas (inventario_id);
ALTER TABLE materiales_inventario_fisico_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_inventario_fisico_lineas;
CREATE POLICY service_role_all ON materiales_inventario_fisico_lineas
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS materiales_mantenimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  material_id uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  unidad_id uuid REFERENCES materiales_unidades(id),
  tipo text NOT NULL DEFAULT 'preventivo',
  estado text NOT NULL DEFAULT 'pendiente',
  fecha_prevista date, fecha_realizada date,
  coste numeric(10,2), notas text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_mant_restaurante ON materiales_mantenimiento (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_mant_material ON materiales_mantenimiento (material_id);
ALTER TABLE materiales_mantenimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_mantenimiento;
CREATE POLICY service_role_all ON materiales_mantenimiento
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS materiales_reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  material_id uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  cantidad int NOT NULL DEFAULT 1,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  parent_tipo text, parent_id uuid,
  cliente_id uuid REFERENCES materiales_clientes(id),
  estado text NOT NULL DEFAULT 'confirmada',
  notas text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_res_restaurante ON materiales_reservas (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_res_material ON materiales_reservas (material_id);
CREATE INDEX IF NOT EXISTS idx_mat_res_fechas ON materiales_reservas (fecha_desde, fecha_hasta);
ALTER TABLE materiales_reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON materiales_reservas;
CREATE POLICY service_role_all ON materiales_reservas
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
