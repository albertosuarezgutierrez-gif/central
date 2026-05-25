-- MÓDULO EVENTOS v2 — ia.rest — 20260525
-- Tablas nuevas: beo_eventos, proveedores_evento, inventario_menaje, leads_eventos
-- ALTER: evento_appcc, evento_pases, eventos, fichajes

CREATE TABLE IF NOT EXISTS beo_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  restaurante_id UUID NOT NULL,
  timeline JSONB DEFAULT '[]',
  layout_tipo TEXT DEFAULT 'banquete_redondas',
  layout_imagen_url TEXT,
  layout_notas TEXT,
  personal_asignado JSONB DEFAULT '[]',
  equipamiento JSONB DEFAULT '[]',
  checklist JSONB DEFAULT '[]',
  estado TEXT NOT NULL DEFAULT 'borrador',
  distribuido_at TIMESTAMPTZ,
  pdf_url TEXT,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE beo_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "beo_own" ON beo_eventos USING (restaurante_id = current_setting('app.restaurante_id')::uuid);
CREATE POLICY "beo_service" ON beo_eventos USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_beo_evento_id ON beo_eventos(evento_id);

CREATE TABLE IF NOT EXISTS proveedores_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'otro',
  contacto_nombre TEXT,
  contacto_telefono TEXT,
  contacto_email TEXT,
  web TEXT,
  notas TEXT,
  comision_pct DECIMAL(5,2) DEFAULT 0,
  iva_tipo INTEGER DEFAULT 21,
  token_portal TEXT UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  portal_activo BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE proveedores_evento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_ev_own" ON proveedores_evento USING (restaurante_id = current_setting('app.restaurante_id')::uuid);
CREATE POLICY "prov_ev_service" ON proveedores_evento USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_prov_ev_rid ON proveedores_evento(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_prov_ev_token ON proveedores_evento(token_portal);

CREATE TABLE IF NOT EXISTS proveedores_evento_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  proveedor_id UUID NOT NULL REFERENCES proveedores_evento(id),
  restaurante_id UUID NOT NULL,
  servicio_descripcion TEXT NOT NULL,
  importe DECIMAL(10,2) NOT NULL DEFAULT 0,
  comision_pct DECIMAL(5,2) DEFAULT 0,
  comision_importe DECIMAL(10,2) DEFAULT 0,
  iva_tipo INTEGER DEFAULT 21,
  estado TEXT DEFAULT 'pendiente',
  hora_llegada TIME,
  briefing TEXT,
  confirmado_proveedor_at TIMESTAMPTZ,
  comision_cobrada_at TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE proveedores_evento_asignaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prov_asig_own" ON proveedores_evento_asignaciones USING (restaurante_id = current_setting('app.restaurante_id')::uuid);
CREATE POLICY "prov_asig_service" ON proveedores_evento_asignaciones USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_prov_asig_ev ON proveedores_evento_asignaciones(evento_id);

CREATE TABLE IF NOT EXISTS inventario_menaje (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT NOT NULL DEFAULT 'vajilla',
  cantidad_total INTEGER NOT NULL DEFAULT 0,
  cantidad_disponible INTEGER NOT NULL DEFAULT 0,
  coste_unitario DECIMAL(8,2) DEFAULT 0,
  proveedor_nombre TEXT,
  imagen_url TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE inventario_menaje ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menaje_own" ON inventario_menaje USING (restaurante_id = current_setting('app.restaurante_id')::uuid);
CREATE POLICY "menaje_service" ON inventario_menaje USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_menaje_rid ON inventario_menaje(restaurante_id);

CREATE TABLE IF NOT EXISTS inventario_menaje_evento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  menaje_id UUID NOT NULL REFERENCES inventario_menaje(id),
  restaurante_id UUID NOT NULL,
  cantidad_reservada INTEGER NOT NULL DEFAULT 0,
  cantidad_devuelta INTEGER DEFAULT 0,
  cantidad_rota INTEGER DEFAULT 0,
  coste_roturas DECIMAL(8,2) DEFAULT 0,
  estado TEXT DEFAULT 'reservado',
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE inventario_menaje_evento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "menaje_ev_own" ON inventario_menaje_evento USING (restaurante_id = current_setting('app.restaurante_id')::uuid);
CREATE POLICY "menaje_ev_service" ON inventario_menaje_evento USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS leads_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id UUID,
  tipo_evento TEXT NOT NULL DEFAULT 'boda',
  fecha_tentativa DATE,
  num_comensales INTEGER,
  presupuesto_orientativo DECIMAL(10,2),
  nombre_contacto TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  espacio_preferido TEXT,
  como_conocio TEXT DEFAULT 'web',
  mensaje TEXT,
  estado TEXT DEFAULT 'nuevo',
  puntuacion_ia INTEGER,
  motivo_perdida TEXT,
  notas_internas TEXT,
  evento_id UUID,
  asignado_a UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE leads_eventos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_ev_own" ON leads_eventos USING (restaurante_id = current_setting('app.restaurante_id')::uuid OR restaurante_id IS NULL);
CREATE POLICY "leads_ev_service" ON leads_eventos USING (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_leads_ev_rid ON leads_eventos(restaurante_id);

ALTER TABLE evento_appcc
  ADD COLUMN IF NOT EXISTS etiqueta_impresa BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS etiqueta_impresa_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plato_testigo_cantidad_gramos INTEGER DEFAULT 100;

ALTER TABLE evento_pases
  ADD COLUMN IF NOT EXISTS hora_inicio_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hora_lista_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hora_servido_at TIMESTAMPTZ;

ALTER TABLE eventos
  ADD COLUMN IF NOT EXISTS factor_escandallo DECIMAL(5,3) DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS briefing_chef TEXT,
  ADD COLUMN IF NOT EXISTS briefing_sala TEXT,
  ADD COLUMN IF NOT EXISTS comision_total_estimada DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beo_estado TEXT DEFAULT 'sin_beo';

ALTER TABLE fichajes
  ADD COLUMN IF NOT EXISTS evento_id UUID REFERENCES eventos(id),
  ADD COLUMN IF NOT EXISTS modo TEXT DEFAULT 'restaurante',
  ADD COLUMN IF NOT EXISTS latitud DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS longitud DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS geolocalizacion_ok BOOLEAN;
