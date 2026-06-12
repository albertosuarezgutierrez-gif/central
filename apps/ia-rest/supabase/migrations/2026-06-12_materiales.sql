-- ============================================================
-- Bloque B — Módulo de Materiales (independiente de eventos)
-- BD viva de ia-rest: proyecto efncqyvhniaxsirhdxaa, schema public
-- (donde viven restaurantes/personal/inventario_menaje). Multi-tenant por
-- restaurante_id, self-consistente con las rutas /api/materiales/*.
-- Genérico: catering/eventos, haciendas, alquiler puro, obra…
-- ============================================================

-- ── Catálogo de materiales (activos físicos) ─────────────────
CREATE TABLE IF NOT EXISTS materiales (
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
CREATE INDEX IF NOT EXISTS idx_materiales_restaurante ON materiales (restaurante_id);

-- ── Asignación / salida hacia un destino genérico ────────────
CREATE TABLE IF NOT EXISTS materiales_asignacion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_mat_asig_restaurante ON materiales_asignacion (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_asig_personal    ON materiales_asignacion (restaurante_id, personal_id);
CREATE INDEX IF NOT EXISTS idx_mat_asig_material    ON materiales_asignacion (material_id);

-- ── Partes de rotura / falta (con foto) ──────────────────────
CREATE TABLE IF NOT EXISTS materiales_dano (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id      uuid NOT NULL,
  material_id         uuid NOT NULL REFERENCES materiales(id) ON DELETE CASCADE,
  asignacion_id       uuid REFERENCES materiales_asignacion(id) ON DELETE SET NULL,
  cantidad            int  NOT NULL DEFAULT 1,
  motivo              text,                            -- rotura|falta|deterioro
  foto_url            text,
  coste               numeric(10,2) DEFAULT 0,         -- cantidad × coste_reposicion (snapshot)
  personal_id         uuid,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mat_dano_restaurante ON materiales_dano (restaurante_id);
CREATE INDEX IF NOT EXISTS idx_mat_dano_asignacion  ON materiales_dano (asignacion_id);

-- ── RLS (las API routes usan service role) ───────────────────
ALTER TABLE materiales            ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_asignacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiales_dano       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all ON materiales;
CREATE POLICY service_role_all ON materiales
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON materiales_asignacion;
CREATE POLICY service_role_all ON materiales_asignacion
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_all ON materiales_dano;
CREATE POLICY service_role_all ON materiales_dano
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
