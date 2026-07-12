-- Feedback del agente contable: el botón 👎 del chat registra aquí las respuestas que Alberto marca
-- como malas (pregunta + respuesta + nota opcional). Alimenta el bucle de mejora (/agentes-entrenador
-- y la cobertura del router). Aplicada en prod por Supabase MCP el 12/07/2026.
CREATE TABLE IF NOT EXISTS contable_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL,
  pregunta text NOT NULL,
  respuesta text,
  nota text,
  resuelto boolean NOT NULL DEFAULT false,   -- lo marca el entrenador cuando ya lo ha convertido en fix/test
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contable_feedback_cuenta ON contable_feedback (cuenta_id, created_at DESC);
