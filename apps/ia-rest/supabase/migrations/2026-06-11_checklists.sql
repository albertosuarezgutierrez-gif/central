-- ============================================================
-- Bloque H — Checklist operativo + carga
-- Schema: iarest. Tablas multi-tenant filtradas por la app via restaurante_id.
-- RLS ON + policy service_role (las API routes usan service role).
-- ============================================================

-- Plantillas de checklist por sección (barra/sala/terraza/cocina u otra)
CREATE TABLE IF NOT EXISTS iarest.checklist_plantillas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  seccion        text NOT NULL,           -- 'barra'|'sala'|'terraza'|'cocina' u otra
  nombre         text,
  -- array de {texto, frecuencia: 'apertura'|'turno'|'cierre', requiere_foto bool}
  tareas         jsonb NOT NULL DEFAULT '[]'::jsonb,
  activa         boolean DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_plantillas_restaurante
  ON iarest.checklist_plantillas (restaurante_id);

-- Ejecuciones de tareas (una fila por tarea marcada como hecha)
CREATE TABLE IF NOT EXISTS iarest.checklist_ejecuciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL,
  plantilla_id   uuid,
  turno_id       uuid,
  personal_id    uuid,
  seccion        text,
  tarea_idx      int,
  tarea_texto    text,
  estado         text DEFAULT 'pendiente',  -- 'pendiente'|'hecha'
  foto_url       text,
  completed_at   timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_ejecuciones_restaurante
  ON iarest.checklist_ejecuciones (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_checklist_ejecuciones_fecha
  ON iarest.checklist_ejecuciones (restaurante_id, created_at);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE iarest.checklist_plantillas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE iarest.checklist_ejecuciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON iarest.checklist_plantillas;
CREATE POLICY service_role_all ON iarest.checklist_plantillas
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON iarest.checklist_ejecuciones;
CREATE POLICY service_role_all ON iarest.checklist_ejecuciones
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
