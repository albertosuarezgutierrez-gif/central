-- Categorías de materiales gestionadas por restaurante (CRUD propio, no hardcodeadas)
CREATE TABLE IF NOT EXISTS materiales_categorias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES restaurantes(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(restaurante_id, nombre)
);

ALTER TABLE materiales_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurante owner" ON materiales_categorias
  USING (restaurante_id = current_setting('app.restaurante_id', true)::uuid);

-- Seed: importa categorías existentes de materiales ya cargados
INSERT INTO materiales_categorias (restaurante_id, nombre)
SELECT DISTINCT restaurante_id, categoria
FROM materiales
WHERE activo = true AND categoria IS NOT NULL
ON CONFLICT DO NOTHING;
