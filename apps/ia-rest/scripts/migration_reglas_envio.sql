-- ============================================================
-- ia.rest · Motor de enrutamiento configurable v1.0
-- Tabla: reglas_envio
-- Fecha: mayo 2026
-- ============================================================
-- Permite al owner mapear: Zona × Sección → Destino (impresora | KDS)
-- COURIER aplica las reglas ítem a ítem antes de crear print_jobs.
-- Sin reglas configuradas → comportamiento anterior (0 breaking changes).
-- ============================================================

CREATE TABLE IF NOT EXISTS reglas_envio (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurante_id  uuid    NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,

  -- Condiciones (NULL = aplica a todas)
  zona_tipo       text,   -- 'salon' | 'terraza' | 'barra' | NULL
  seccion_id      text,   -- slug de secciones_cocina | NULL

  -- Destino
  destino_tipo    text    NOT NULL CHECK (destino_tipo IN ('impresora', 'kds')),
  destino_ref     text    NOT NULL, -- impresoras.id (uuid) ó secciones_cocina.id (slug)
  destino_nombre  text,   -- caché de nombre para la UI, no normativo

  -- Control
  prioridad       int     NOT NULL DEFAULT 5,
  activa          bool    NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_reglas_envio_restaurante
  ON reglas_envio(restaurante_id);

CREATE INDEX IF NOT EXISTS idx_reglas_envio_lookup
  ON reglas_envio(restaurante_id, activa, prioridad DESC);

-- RLS
ALTER TABLE reglas_envio ENABLE ROW LEVEL SECURITY;

-- Política: acceso completo vía service_role (API routes usan service_role key)
-- Las políticas abajo son para acceso directo (Supabase Studio / futuro)
CREATE POLICY "service_role_all" ON reglas_envio
  USING (true)
  WITH CHECK (true);

-- Comentario
COMMENT ON TABLE reglas_envio IS
  'Motor de enrutamiento: Zona × Sección → Impresora o KDS. Configurable por owner.';
COMMENT ON COLUMN reglas_envio.zona_tipo IS
  'NULL = aplica a todas las zonas. Valor: tipo de zona (salon, terraza, barra...)';
COMMENT ON COLUMN reglas_envio.seccion_id IS
  'NULL = aplica a todas las secciones. Valor: slug de secciones_cocina';
COMMENT ON COLUMN reglas_envio.destino_ref IS
  'Si destino_tipo=impresora → UUID de impresoras. Si destino_tipo=kds → slug de secciones_cocina';
COMMENT ON COLUMN reglas_envio.prioridad IS
  'Mayor número = mayor prioridad. Desempate: zona+seccion > zona > seccion > global';
