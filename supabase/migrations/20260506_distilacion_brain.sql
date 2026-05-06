-- ============================================================
-- MIGRACIÓN: Destilación BRAIN — fuente + latencia brain
-- Mayo 2026
-- ============================================================
-- Ejecutar en Supabase SQL Editor

-- 1. Añadir columnas a transcripciones
ALTER TABLE transcripciones
  ADD COLUMN IF NOT EXISTS fuente_brain text DEFAULT 'claude_api'
    CHECK (fuente_brain IN ('patron', 'claude_api', 'modelo_propio')),
  ADD COLUMN IF NOT EXISTS latencia_brain_ms integer;

COMMENT ON COLUMN transcripciones.fuente_brain IS
  'Qué capa resolvió la comanda: patron (regex, <10ms) | claude_api (~500ms) | modelo_propio (futuro)';
COMMENT ON COLUMN transcripciones.latencia_brain_ms IS
  'Milisegundos que tardó solo el BRAIN (sin EAR ni DB ops)';

-- 2. Añadir columnas a ia_training_log (si existe)
ALTER TABLE ia_training_log
  ADD COLUMN IF NOT EXISTS fuente text DEFAULT 'claude_api'
    CHECK (fuente IN ('patron', 'claude_api', 'modelo_propio')),
  ADD COLUMN IF NOT EXISTS confianza numeric(4,2);

COMMENT ON COLUMN ia_training_log.fuente IS
  'Origen del par training: patron=fast lane, claude_api=fallback, modelo_propio=futuro';
COMMENT ON COLUMN ia_training_log.confianza IS
  'Confianza reportada por BRAIN al generar el par de entrenamiento';

-- 3. Actualizar el trigger trg_transcripcion_to_training_log
--    para propagar fuente y confianza al log de entrenamiento
--    (solo si el trigger existe)
CREATE OR REPLACE FUNCTION fn_transcripcion_to_training_log()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo loguear si hay texto procesable
  IF NEW.texto_original IS NULL OR NEW.texto_brain IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO ia_training_log (
    restaurante_id,
    camarero_id,
    turno_id,
    comanda_id,
    texto_original,
    texto_brain,
    latencia_ms,
    fuente,
    confianza,
    created_at
  ) VALUES (
    NEW.restaurante_id,
    NEW.camarero_id,
    NEW.turno_id,
    NEW.comanda_id,
    NEW.texto_original,
    NEW.texto_brain,
    NEW.latencia_ms,
    COALESCE(NEW.fuente_brain, 'claude_api'),
    COALESCE((NEW.texto_brain->>'confianza')::numeric, NULL),
    NOW()
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger (DROP IF EXISTS + CREATE)
DROP TRIGGER IF EXISTS trg_transcripcion_to_training_log ON transcripciones;
CREATE TRIGGER trg_transcripcion_to_training_log
  AFTER INSERT ON transcripciones
  FOR EACH ROW
  EXECUTE FUNCTION fn_transcripcion_to_training_log();

-- 4. Vista de estadísticas de destilación (para /super dashboard)
CREATE OR REPLACE VIEW v_distilacion_stats AS
SELECT
  restaurante_id,
  DATE_TRUNC('day', created_at)              AS dia,
  fuente_brain,
  COUNT(*)                                   AS total,
  ROUND(AVG(latencia_brain_ms))              AS latencia_brain_avg_ms,
  ROUND(AVG(latencia_ms))                    AS latencia_total_avg_ms,
  ROUND(AVG((texto_brain->>'confianza')::numeric)::numeric, 2) AS confianza_avg
FROM transcripciones
WHERE fuente_brain IS NOT NULL
GROUP BY restaurante_id, dia, fuente_brain
ORDER BY dia DESC, fuente_brain;

COMMENT ON VIEW v_distilacion_stats IS
  'Estadísticas diarias del router de destilación: % patron vs claude_api y latencias';

-- 5. Vista de ratio de ahorro (para decidir cuándo entrenar el modelo propio)
CREATE OR REPLACE VIEW v_distilacion_ratio AS
SELECT
  restaurante_id,
  COUNT(*) FILTER (WHERE fuente_brain = 'patron')      AS total_patron,
  COUNT(*) FILTER (WHERE fuente_brain = 'claude_api')  AS total_claude,
  COUNT(*) FILTER (WHERE fuente_brain = 'modelo_propio') AS total_modelo,
  COUNT(*)                                              AS total,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE fuente_brain = 'patron') / NULLIF(COUNT(*), 0), 1
  )                                                    AS pct_fast_lane,
  ROUND(
    COUNT(*) FILTER (WHERE fuente_brain = 'claude_api') * 0.0023, 4
  )                                                    AS coste_claude_total_eur
FROM transcripciones
WHERE fuente_brain IS NOT NULL
GROUP BY restaurante_id;

COMMENT ON VIEW v_distilacion_ratio IS
  'Ratio de uso del fast lane vs Claude y coste acumulado en EUR';
