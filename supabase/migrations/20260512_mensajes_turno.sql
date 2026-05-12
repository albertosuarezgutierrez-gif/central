-- Comunicación entre roles activos del turno
-- Mayo 2026

CREATE TABLE IF NOT EXISTS mensajes_turno (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id  UUID NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  turno_id        UUID REFERENCES turnos(id) ON DELETE SET NULL,

  -- Emisor
  camarero_id     UUID REFERENCES camareros(id) ON DELETE SET NULL,
  rol_origen      TEXT NOT NULL,   -- 'camarero'|'cocina'|'jefe_sala'|'running'
  nombre_origen   TEXT NOT NULL,   -- nombre del camarero (snapshot)

  -- Destino
  destinatario_id UUID REFERENCES camareros(id) ON DELETE SET NULL,
  rol_destino     TEXT NOT NULL DEFAULT 'todos', -- 'cocina'|'camarero'|'jefe_sala'|'todos'

  -- Contenido
  tipo            TEXT NOT NULL DEFAULT 'texto',  -- 'texto'|'alerta'|'sistema'
  texto           TEXT NOT NULL,
  mesa_ref        TEXT,           -- código de mesa si aplica (ej: 'T04')

  -- Estado
  leido_por       UUID[],         -- array de camarero_id que lo leyeron
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mensajes_restaurante_turno
  ON mensajes_turno(restaurante_id, turno_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mensajes_destinatario
  ON mensajes_turno(destinatario_id) WHERE destinatario_id IS NOT NULL;

-- RLS
ALTER TABLE mensajes_turno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_mensajes_turno" ON mensajes_turno
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE mensajes_turno;
