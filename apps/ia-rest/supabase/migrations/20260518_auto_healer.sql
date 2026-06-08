-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Auto-Healer v1.0 — ia.rest (18/05/2026)
-- Memoria de fallos, heal_stats, widget owner, modo servicio/madrugada
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columna repeticiones en incidencias_sistema ─────────────────────────
-- Cuenta cuántas veces se ha registrado el mismo tipo de fallo en 24h
ALTER TABLE incidencias_sistema
  ADD COLUMN IF NOT EXISTS repeticiones INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dia_semana   SMALLINT,   -- 0=lunes … 6=domingo
  ADD COLUMN IF NOT EXISTS hora_dia     SMALLINT;   -- 0-23

-- Trigger para rellenar dia_semana y hora_dia al insertar
CREATE OR REPLACE FUNCTION fn_incidencia_metadatos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.dia_semana := EXTRACT(DOW FROM now())::SMALLINT; -- 0=domingo, 6=sábado
  NEW.hora_dia   := EXTRACT(HOUR FROM now())::SMALLINT;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incidencia_metadatos ON incidencias_sistema;
CREATE TRIGGER trg_incidencia_metadatos
  BEFORE INSERT ON incidencias_sistema
  FOR EACH ROW EXECUTE FUNCTION fn_incidencia_metadatos();

-- ── 2. Vista v_heal_stats — estadísticas globales de auto-curación ─────────
CREATE OR REPLACE VIEW v_heal_stats AS
SELECT
  -- Últimas 24h
  COUNT(*)                                                            AS total_24h,
  COUNT(*) FILTER (WHERE resuelta = true AND auto_resuelta = true)   AS auto_resueltas_24h,
  COUNT(*) FILTER (WHERE resuelta = false AND nivel = 'critico')     AS criticas_pendientes,
  COUNT(*) FILTER (WHERE resuelta = false)                           AS pendientes_24h,
  -- Últimos 30 días
  COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')   AS total_30d,
  COUNT(*) FILTER (
    WHERE created_at > now() - interval '30 days'
      AND resuelta = true AND auto_resuelta = true
  )                                                                   AS auto_resueltas_30d,
  -- Tasa de auto-resolución
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE resuelta = true AND auto_resuelta = true)
    / NULLIF(COUNT(*) FILTER (WHERE resuelta = true), 0),
    1
  )                                                                   AS tasa_auto_pct,
  -- Tipo más frecuente
  (
    SELECT tipo FROM incidencias_sistema
    WHERE created_at > now() - interval '30 days'
    GROUP BY tipo ORDER BY COUNT(*) DESC LIMIT 1
  )                                                                   AS tipo_mas_frecuente,
  -- Hora pico de fallos
  (
    SELECT hora_dia FROM incidencias_sistema
    WHERE created_at > now() - interval '30 days'
      AND hora_dia IS NOT NULL
    GROUP BY hora_dia ORDER BY COUNT(*) DESC LIMIT 1
  )                                                                   AS hora_pico
FROM incidencias_sistema
WHERE created_at > now() - interval '24 hours';

-- ── 3. Vista v_heal_stats_restaurante — para widget en /owner ──────────────
CREATE OR REPLACE VIEW v_heal_stats_restaurante AS
SELECT
  restaurante_id,
  COUNT(*)                                                            AS total_30d,
  COUNT(*) FILTER (WHERE resuelta = true AND auto_resuelta = true)   AS auto_resueltas_30d,
  COUNT(*) FILTER (WHERE resuelta = false)                           AS pendientes,
  COUNT(*) FILTER (WHERE nivel = 'critico' AND resuelta = false)     AS criticas_activas,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE resuelta = true AND auto_resuelta = true)
    / NULLIF(COUNT(*) FILTER (WHERE resuelta = true), 0),
    1
  )                                                                   AS tasa_auto_pct,
  MAX(created_at) FILTER (WHERE auto_resuelta = true)                AS ultimo_auto_fix
FROM incidencias_sistema
WHERE created_at > now() - interval '30 days'
  AND restaurante_id IS NOT NULL
GROUP BY restaurante_id;

-- ── 4. Vista v_patrones_fallos — detecta patrones horarios repetidos ───────
CREATE OR REPLACE VIEW v_patrones_fallos AS
SELECT
  tipo,
  modulo,
  restaurante_id,
  dia_semana,
  hora_dia,
  COUNT(*) AS ocurrencias,
  MAX(created_at) AS ultima_vez
FROM incidencias_sistema
WHERE created_at > now() - interval '30 days'
  AND dia_semana IS NOT NULL
  AND hora_dia IS NOT NULL
GROUP BY tipo, modulo, restaurante_id, dia_semana, hora_dia
HAVING COUNT(*) >= 3  -- patrón si ocurre 3+ veces en mismo slot
ORDER BY ocurrencias DESC;

-- ── 5. Política RLS para que /owner pueda leer sus propias stats ───────────
-- La vista ya filtra por restaurante_id, y la API route hace el filtro
-- Añadimos política de lectura por sesión válida (solo service_role escribe)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='incidencias_sistema' AND policyname='anon_read_own'
  ) THEN
    CREATE POLICY "anon_read_own" ON incidencias_sistema
      FOR SELECT USING (true); -- filtrado en app layer por restaurante_id
  END IF;
END $$;

-- ── 6. Índice adicional para la consulta de patrones (dia+hora) ────────────
CREATE INDEX IF NOT EXISTS idx_incidencias_dia_hora
  ON incidencias_sistema(dia_semana, hora_dia)
  WHERE dia_semana IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidencias_auto
  ON incidencias_sistema(auto_resuelta, created_at DESC)
  WHERE auto_resuelta = true;

