-- =====================================================================
-- Migración: stock_consumos
-- Registra qué productos se usaron en cada sesión de limpieza
-- Permite calcular coste real por sesión y consumo medio por tipo de piso
-- =====================================================================

CREATE TABLE IF NOT EXISTS stock_consumos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID        NOT NULL,
  session_id     UUID        NOT NULL,
  producto_id    UUID        NOT NULL,
  cantidad       NUMERIC(10,3) NOT NULL DEFAULT 0,
  coste_unitario NUMERIC(10,2),
  coste_total    NUMERIC(10,2) GENERATED ALWAYS AS (
                   CASE WHEN coste_unitario IS NOT NULL
                   THEN ROUND(cantidad * coste_unitario, 2) END
                 ) STORED,
  notas          TEXT,
  registrado_por UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_sc_empresa   FOREIGN KEY (empresa_id)  REFERENCES empresas(id)    ON DELETE CASCADE,
  CONSTRAINT fk_sc_session   FOREIGN KEY (session_id)  REFERENCES cleaning_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sc_producto  FOREIGN KEY (producto_id) REFERENCES productos_stock(id)   ON DELETE RESTRICT,
  CONSTRAINT uq_sc_session_producto UNIQUE (session_id, producto_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_consumos_empresa  ON stock_consumos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_stock_consumos_session  ON stock_consumos(session_id);
CREATE INDEX IF NOT EXISTS idx_stock_consumos_producto ON stock_consumos(producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_consumos_fecha    ON stock_consumos(created_at);

ALTER TABLE stock_consumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_consumos_empresa ON stock_consumos
  USING (empresa_id::text = current_setting('app.empresa_id', true));

CREATE OR REPLACE VIEW coste_por_sesion AS
SELECT
  sc.session_id,
  cs.empresa_id,
  cs.property_name,
  cs.fecha_servicio,
  cs.tipo_servicio,
  COUNT(sc.id)       AS num_productos,
  SUM(sc.coste_total)AS coste_productos,
  SUM(sc.coste_total)AS coste_total_estimado
FROM stock_consumos sc
JOIN cleaning_sessions cs ON cs.id = sc.session_id
GROUP BY sc.session_id, cs.empresa_id, cs.property_name, cs.fecha_servicio, cs.tipo_servicio;

COMMENT ON TABLE stock_consumos IS
  'Productos consumidos por sesión. Permite calcular coste real por limpieza.';
