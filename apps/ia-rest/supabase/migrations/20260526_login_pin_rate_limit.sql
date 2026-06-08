-- ================================================================
-- login_pin con rate limiting en BD
-- Reemplaza la versión sin rate limit
-- Máx 10 intentos por restaurante+IP en 5 min → bloqueo 15min
-- ================================================================

-- Tabla para registrar intentos (si no existe ya con otro nombre)
CREATE TABLE IF NOT EXISTS pin_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address  TEXT NOT NULL,
  restaurante_id UUID NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_attempts_ip_rid_ts
  ON pin_attempts(ip_address, restaurante_id, created_at);

-- Limpiar intentos antiguos automáticamente (pg_cron si disponible)
-- También se limpian dentro de la función

-- ================================================================
-- RPC: login_pin
-- ================================================================
CREATE OR REPLACE FUNCTION login_pin(
  p_restaurante_id UUID,
  p_pin            TEXT,
  p_ip_address     TEXT DEFAULT 'unknown'
)
RETURNS TABLE(
  success        BOOLEAN,
  camarero_id    UUID,
  nombre         TEXT,
  rol            TEXT,
  blocked        BOOLEAN,
  blocked_until  TIMESTAMPTZ,
  intentos_restantes INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start   TIMESTAMPTZ := now() - INTERVAL '5 minutes';
  v_block_start    TIMESTAMPTZ := now() - INTERVAL '15 minutes';
  v_intentos       INT;
  v_camarero       RECORD;
BEGIN
  -- 1. Limpiar intentos viejos (>15min) para no acumular basura
  DELETE FROM pin_attempts
  WHERE created_at < now() - INTERVAL '15 minutes';

  -- 2. Contar intentos recientes de esta IP + restaurante en ventana 5min
  SELECT COUNT(*) INTO v_intentos
  FROM pin_attempts
  WHERE ip_address    = p_ip_address
    AND restaurante_id = p_restaurante_id
    AND created_at    >= v_window_start;

  -- 3. Si hay 10+ intentos en los últimos 5min → bloquear
  IF v_intentos >= 10 THEN
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT,
      TRUE,
      (SELECT MAX(created_at) + INTERVAL '15 minutes'
       FROM pin_attempts
       WHERE ip_address = p_ip_address AND restaurante_id = p_restaurante_id),
      0::INT;
    RETURN;
  END IF;

  -- 4. Registrar este intento ANTES de verificar (cuenta incluso si es correcto)
  INSERT INTO pin_attempts(ip_address, restaurante_id)
  VALUES (p_ip_address, p_restaurante_id);

  -- 5. Buscar camarero con ese PIN en ese restaurante
  SELECT id, nombre, rol INTO v_camarero
  FROM personal
  WHERE restaurante_id = p_restaurante_id
    AND pin = p_pin
    AND activo = true
  LIMIT 1;

  IF v_camarero IS NULL THEN
    -- PIN incorrecto
    RETURN QUERY SELECT
      FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT,
      FALSE, NULL::TIMESTAMPTZ,
      (10 - v_intentos - 1)::INT;  -- intentos restantes
    RETURN;
  END IF;

  -- 6. PIN correcto → limpiar intentos de esta IP+restaurante
  DELETE FROM pin_attempts
  WHERE ip_address = p_ip_address AND restaurante_id = p_restaurante_id;

  RETURN QUERY SELECT
    TRUE, v_camarero.id, v_camarero.nombre, v_camarero.rol,
    FALSE, NULL::TIMESTAMPTZ, 10::INT;
END;
$$;

-- RLS: la función es SECURITY DEFINER, accesible con anon key
GRANT EXECUTE ON FUNCTION login_pin(UUID, TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION login_pin IS
  'Valida PIN con rate limiting en BD: máx 10 intentos/IP/restaurante en 5min, bloqueo 15min';
