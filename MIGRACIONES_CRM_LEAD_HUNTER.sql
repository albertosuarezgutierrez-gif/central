-- Tabla: leads_web_tracking
CREATE TABLE IF NOT EXISTS leads_web_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads ON DELETE CASCADE,
  restaurante_id UUID NOT NULL,
  
  mensaje_dia1_at TIMESTAMPTZ,
  mensaje_dia2_at TIMESTAMPTZ,
  
  web_click_at TIMESTAMPTZ,
  formulario_rellenado_at TIMESTAMPTZ,
  
  estado TEXT DEFAULT 'pendiente',
  utm_source TEXT,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE leads_web_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON leads_web_tracking
  FOR SELECT USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

CREATE POLICY "insert_own" ON leads_web_tracking
  FOR INSERT WITH CHECK (restaurante_id = current_setting('app.restaurante_id')::uuid);

CREATE POLICY "update_own" ON leads_web_tracking
  FOR UPDATE USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

CREATE POLICY "service_role_all" ON leads_web_tracking
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_leads_web_tracking_lead_id ON leads_web_tracking(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_web_tracking_restaurante ON leads_web_tracking(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_leads_web_tracking_estado ON leads_web_tracking(estado);

---

-- Tabla: leads_unsubscribes
CREATE TABLE IF NOT EXISTS leads_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads ON DELETE CASCADE,
  restaurante_id UUID NOT NULL,
  
  unsubscribed_at TIMESTAMPTZ DEFAULT now(),
  razon TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(lead_id, restaurante_id)
);

ALTER TABLE leads_unsubscribes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON leads_unsubscribes
  FOR SELECT USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

CREATE POLICY "insert_own" ON leads_unsubscribes
  FOR INSERT WITH CHECK (restaurante_id = current_setting('app.restaurante_id')::uuid);

CREATE POLICY "service_role_all" ON leads_unsubscribes
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_leads_unsubscribes_lead_id ON leads_unsubscribes(lead_id);

---

-- Tabla: formularios_demo_recibidos
CREATE TABLE IF NOT EXISTS formularios_demo_recibidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads ON DELETE CASCADE,
  restaurante_id UUID NOT NULL,
  
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT NOT NULL,
  restaurante TEXT NOT NULL,
  locales TEXT,
  
  visto_por_alberto BOOLEAN DEFAULT false,
  contactado_at TIMESTAMPTZ,
  
  recibido_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE formularios_demo_recibidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON formularios_demo_recibidos
  FOR SELECT USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

CREATE POLICY "insert_own" ON formularios_demo_recibidos
  FOR INSERT WITH CHECK (restaurante_id = current_setting('app.restaurante_id')::uuid);

CREATE POLICY "service_role_all" ON formularios_demo_recibidos
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_formularios_demo_lead_id ON formularios_demo_recibidos(lead_id);
CREATE INDEX IF NOT EXISTS idx_formularios_demo_recibido_at ON formularios_demo_recibidos(recibido_at);

---

-- RPC: search_leads_sevilla_nuevos
CREATE OR REPLACE FUNCTION search_leads_sevilla_nuevos(limit_count INT DEFAULT 3)
RETURNS TABLE (
  id UUID,
  nombre TEXT,
  email TEXT,
  ciudad TEXT,
  tipo_negocio TEXT,
  web TEXT,
  restaurante_id UUID,
  num_locales BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.nombre,
    l.email,
    l.ciudad,
    l.tipo_negocio,
    l.web,
    l.restaurante_id,
    COUNT(DISTINCT ll.id) as num_locales
  FROM leads l
  LEFT JOIN leads_locales ll ON ll.empresa_id = l.id
  LEFT JOIN leads_contactos lc ON lc.lead_id = l.id
  LEFT JOIN leads_unsubscribes lu ON lu.lead_id = l.id
  LEFT JOIN leads_web_tracking lwt ON lwt.lead_id = l.id
  
  WHERE 
    l.ciudad ILIKE '%Sevilla%'
    AND l.tipo_negocio != 'hotel'
    AND lc.lead_id IS NULL
    AND lu.lead_id IS NULL
    AND lwt.lead_id IS NULL
  
  GROUP BY l.id, l.nombre, l.email, l.ciudad, l.tipo_negocio, l.web, l.restaurante_id
  HAVING 
    COUNT(DISTINCT ll.id) >= 2 
    OR (COUNT(DISTINCT ll.id) = 1 AND COALESCE(MAX(ll.num_mesas), 0) > 60)
  
  ORDER BY 
    CASE 
      WHEN l.tipo_negocio = 'catering' AND COUNT(DISTINCT ll.id) >= 5 THEN 1
      WHEN l.tipo_negocio = 'catering' AND COUNT(DISTINCT ll.id) >= 2 THEN 2
      WHEN l.tipo_negocio IN ('eventos', 'banquete') THEN 3
      ELSE 4
    END,
    RANDOM()
  
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
