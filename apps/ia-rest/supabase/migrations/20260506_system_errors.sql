-- ============================================================
-- ia.rest · Sistema de monitorización de errores
-- 20260506_system_errors.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS system_errors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id  uuid REFERENCES restaurantes(id) ON DELETE SET NULL,

  nivel           text NOT NULL CHECK (nivel IN ('info', 'warning', 'critical')),
  categoria       text NOT NULL CHECK (categoria IN (
                    'ear','brain','courier','vox','auth',
                    'stripe','verifactu','push','edge','db','system'
                  )),

  mensaje         text NOT NULL,
  contexto        jsonb,
  funcion_origen  text,
  request_id      text,

  resuelto        boolean NOT NULL DEFAULT false,
  resuelto_at     timestamptz,
  resuelto_por    text,
  notas_resolucion text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_errors_nivel      ON system_errors(nivel);
CREATE INDEX IF NOT EXISTS idx_system_errors_categoria  ON system_errors(categoria);
CREATE INDEX IF NOT EXISTS idx_system_errors_restaurante ON system_errors(restaurante_id);
CREATE INDEX IF NOT EXISTS idx_system_errors_resuelto   ON system_errors(resuelto);
CREATE INDEX IF NOT EXISTS idx_system_errors_created    ON system_errors(created_at DESC);

ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_all" ON system_errors
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Vista resumen para el panel /super
CREATE OR REPLACE VIEW v_system_errors_resumen AS
SELECT
  nivel,
  categoria,
  COUNT(*)                                              AS total,
  COUNT(*) FILTER (WHERE resuelto = false)              AS pendientes,
  COUNT(*) FILTER (WHERE resuelto = true)               AS resueltos,
  MAX(created_at)                                       AS ultimo_error,
  COUNT(*) FILTER (
    WHERE created_at > now() - interval '1 hour'
  )                                                     AS ultima_hora
FROM system_errors
WHERE created_at > now() - interval '24 hours'
GROUP BY nivel, categoria
ORDER BY
  CASE nivel WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
  categoria;

-- RPC para marcar como resuelto desde /super
CREATE OR REPLACE FUNCTION resolver_error(
  p_error_id        uuid,
  p_notas           text DEFAULT NULL,
  p_resuelto_por    text DEFAULT 'alberto'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE system_errors
  SET resuelto         = true,
      resuelto_at      = now(),
      resuelto_por     = p_resuelto_por,
      notas_resolucion = p_notas
  WHERE id = p_error_id;
END;
$$;
