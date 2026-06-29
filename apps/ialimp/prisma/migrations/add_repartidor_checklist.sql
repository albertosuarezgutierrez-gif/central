-- Plantillas de checklist por tipo de parada
CREATE TABLE IF NOT EXISTS repartidor_checklist_plantillas (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL,
  tipo       text NOT NULL,
  nombre     text NOT NULL,
  items      jsonb NOT NULL DEFAULT '[]'::jsonb,
  activa     boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rcp_empresa_tipo ON repartidor_checklist_plantillas(empresa_id, tipo);

-- Items instanciados por parada (se copian de la plantilla al crear)
CREATE TABLE IF NOT EXISTS repartidor_parada_items (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id    uuid NOT NULL,
  parada_id     uuid NOT NULL REFERENCES repartidor_paradas(id) ON DELETE CASCADE,
  orden         int NOT NULL DEFAULT 0,
  texto         text NOT NULL,
  obligatorio   boolean NOT NULL DEFAULT true,
  requiere_foto boolean NOT NULL DEFAULT false,
  completado    boolean NOT NULL DEFAULT false,
  completado_at timestamptz,
  foto_url      text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rpi_parada ON repartidor_parada_items(parada_id);
