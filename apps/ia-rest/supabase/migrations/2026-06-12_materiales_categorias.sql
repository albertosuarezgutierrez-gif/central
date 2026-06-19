-- Categorías de materiales gestionadas por restaurante (CRUD propio, no hardcodeadas)
-- BD: compartida wswbehlcuxqxyinousql · schema iarest (aplicada 2026-06-18)
SET search_path TO iarest, public;

CREATE TABLE IF NOT EXISTS materiales_categorias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(restaurante_id, nombre)
);

ALTER TABLE materiales_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restaurante owner" ON materiales_categorias;
CREATE POLICY "restaurante owner" ON materiales_categorias
  USING (restaurante_id = current_setting('app.restaurante_id', true)::uuid);

-- El servidor consulta con service_role (bypassa RLS); policy explícita por consistencia
DROP POLICY IF EXISTS service_role_all ON materiales_categorias;
CREATE POLICY service_role_all ON materiales_categorias
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Seed: importa categorías existentes de materiales ya cargados
INSERT INTO materiales_categorias (restaurante_id, nombre)
SELECT DISTINCT restaurante_id, categoria
FROM materiales
WHERE activo = true AND categoria IS NOT NULL
ON CONFLICT DO NOTHING;