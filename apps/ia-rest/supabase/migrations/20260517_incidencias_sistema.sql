-- Migración: tabla incidencias_sistema
-- Sistema de monitorización proactiva con notificaciones Telegram

-- Tabla principal de incidencias
CREATE TABLE IF NOT EXISTS incidencias_sistema (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          TEXT NOT NULL,
  modulo        TEXT NOT NULL DEFAULT 'sistema',
  nivel         TEXT NOT NULL DEFAULT 'aviso'
                CHECK (nivel IN ('info', 'aviso', 'critico', 'resuelto')),
  mensaje       TEXT NOT NULL,
  detalle       JSONB DEFAULT '{}',
  restaurante_id UUID REFERENCES restaurantes(id) ON DELETE SET NULL,
  resuelta      BOOLEAN DEFAULT false,
  auto_resuelta BOOLEAN DEFAULT false,
  resuelta_at   TIMESTAMPTZ,
  resuelta_por  TEXT,  -- 'auto' | 'alberto' | uuid del admin
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_incidencias_restaurante ON incidencias_sistema(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_incidencias_resuelta ON incidencias_sistema(resuelta);
CREATE INDEX IF NOT EXISTS idx_incidencias_nivel ON incidencias_sistema(nivel);
CREATE INDEX IF NOT EXISTS idx_incidencias_created ON incidencias_sistema(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidencias_tipo ON incidencias_sistema(tipo);

-- RLS: solo service_role puede escribir, super_admin puede leer todo
ALTER TABLE incidencias_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON incidencias_sistema
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- View para el panel /super — resumen de las últimas 24h
CREATE OR REPLACE VIEW v_incidencias_resumen AS
SELECT
  nivel,
  modulo,
  COUNT(*) FILTER (WHERE resuelta = false) AS pendientes,
  COUNT(*) FILTER (WHERE resuelta = true AND auto_resuelta = true) AS auto_resueltas,
  COUNT(*) FILTER (WHERE resuelta = true AND auto_resuelta = false) AS resueltas_manual,
  COUNT(*) AS total,
  MAX(created_at) AS ultima_incidencia
FROM incidencias_sistema
WHERE created_at > now() - interval '24 hours'
GROUP BY nivel, modulo
ORDER BY
  CASE nivel WHEN 'critico' THEN 1 WHEN 'aviso' THEN 2 WHEN 'info' THEN 3 ELSE 4 END,
  modulo;

-- Purga automática: mantener solo últimos 90 días
-- (ya existe el cron de purga en el proyecto, añadir a él si hace falta)
