-- ============================================================
-- Bloque B — Módulo de Materiales (independiente de eventos)
-- Schema: iarest. Multi-tenant por restaurante_id. RLS ON + service_role.
-- Genérico: sirve para catering/eventos, haciendas, alquiler puro, obra…
-- ============================================================

-- ── Catálogo de materiales (activos físicos) ─────────────────
CREATE TABLE IF NOT EXISTS iarest.materiales (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  nombre              text NOT NULL,
  descripcion         text,
  categoria           text NOT NULL DEFAULT 'otro',   -- mesa|silla|vajilla|cristaleria|manteleria|otro
  cantidad_total      int  NOT NULL DEFAULT 0,
  cantidad_disponible int  NOT NULL DEFAULT 0,
  coste_reposicion    numeric(10,2) DEFAULT 0,         -- € por unidad (para liquidar roturas)
  proveedor_nombre    text,
  imagen_url          text,
  activo              boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_materiales_restaurante ON iarest.materiales (restaurante_id);

-- ── Asignación / salida hacia un destino genérico ────────────
CREATE TABLE IF NOT EXISTS iarest.materiales_asignacion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES iarest.materiales(id) ON DELETE CASCADE,
  destino_tipo        text NOT NULL DEFAULT 'evento',  -- evento|hacienda|cliente|obra|otro
  destino_ref         uuid,                            -- id opcional del evento/hacienda… (sin FK dura)
  destino_nombre      text,                            -- etiqueta legible ("Boda Pérez", "Hacienda El Alba")
  cantidad            int  NOT NULL DEFAULT 0,
  cantidad_devuelta   int  DEFAULT 0,
  estado              text NOT NULL DEFAULT 'reservado', -- reservado|entregado|devuelto
  personal_id         uuid,                            -- empleado responsable (montador)
  fecha_salida        date,
  fecha_devolucion    date,
  notas               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_asig_restaurante ON iarest.materiales_asignacion (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_asig_personal    ON iarest.materiales_asignacion (restaurante_id, personal_id);
CREATE INDEX IF NOT EXISTS idx_mat_asig_material    ON iarest.materiales_asignacion (material_id);

-- ── Partes de rotura / falta (con foto) ──────────────────────
CREATE TABLE IF NOT EXISTS iarest.materiales_dano (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES iarest.materiales(id) ON DELETE CASCADE,
  asignacion_id       uuid REFERENCES iarest.materiales_asignacion(id) ON DELETE SET NULL,
  cantidad            int  NOT NULL DEFAULT 1,
  motivo              text,                            -- rotura|falta|deterioro
  foto_url            text,
  coste               numeric(10,2) DEFAULT 0,         -- cantidad × coste_reposicion (snapshot)
  personal_id         uuid,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_dano_restaurante ON iarest.materiales_dano (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_dano_asignacion  ON iarest.materiales_dano (asignacion_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE iarest.materiales            ENABLE ROW LEVEL SECURITY;
ALTER TABLE iarest.materiales_asignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE iarest.materiales_dano       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON iarest.materiales;
CREATE POLICY service_role_all ON iarest.materiales
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON iarest.materiales_asignacion;
CREATE POLICY service_role_all ON iarest.materiales_asignacion
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON iarest.materiales_dano;
CREATE POLICY service_role_all ON iarest.materiales_dano
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
