-- ============================================================
-- Bloque I — Perfil del cocinero + productividad
-- Schema: iarest. Tablas multi-tenant filtradas por la app via restaurante_id.
-- RLS ON + policy service_role (las API routes usan service role).
-- ============================================================

-- Tareas de producción (mise en place / elaboraciones del día)
CREATE TABLE IF NOT EXISTS iarest.produccion_tareas (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id     uuid NOT NULL,
  fecha              date NOT NULL DEFAULT current_date,
  evento_id          uuid,
  seccion_cocina_id  uuid,
  elaboracion_nombre text NOT NULL,
  cantidad           numeric,
  tiempo_estimado_min numeric,
  personal_id        uuid,               -- cocinero asignado
  orden              int,
  estado             text DEFAULT 'pendiente',  -- 'pendiente'|'en_proceso'|'hecha'
  tiempo_real_min    numeric,
  started_at         timestamptz,
  done_at            timestamptz,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produccion_tareas_restaurante
  ON iarest.produccion_tareas (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_produccion_tareas_fecha
  ON iarest.produccion_tareas (restaurante_id, fecha);

-- Tiempos estándar por elaboración (minutos por unidad)
CREATE TABLE IF NOT EXISTS iarest.produccion_tiempos_estandar (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id     uuid NOT NULL,
  elaboracion_nombre text NOT NULL,
  minutos_por_unidad numeric NOT NULL,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produccion_tiempos_restaurante
  ON iarest.produccion_tiempos_estandar (restaurante_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE iarest.produccion_tareas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE iarest.produccion_tiempos_estandar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON iarest.produccion_tareas;
CREATE POLICY service_role_all ON iarest.produccion_tareas
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON iarest.produccion_tiempos_estandar;
CREATE POLICY service_role_all ON iarest.produccion_tiempos_estandar
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
