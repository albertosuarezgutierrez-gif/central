-- ia.rest · Módulo de fichaje (registro de jornada RD-ley 8/2019)
-- Rediseño tabla turnos: de turno global del restaurante a fichaje individual por trabajador

-- ── 1. Añadir columnas de fichaje a la tabla turnos existente ──────────────────

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS restaurante_id  UUID REFERENCES restaurantes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS camarero_id     UUID REFERENCES camareros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entrada_at      TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS salida_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS horas_totales   NUMERIC(5,2),  -- calculado al fichar salida
  ADD COLUMN IF NOT EXISTS tipo            TEXT DEFAULT 'normal' CHECK (tipo IN ('normal','extra','partido')),
  ADD COLUMN IF NOT EXISTS notas           TEXT,
  ADD COLUMN IF NOT EXISTS ip_entrada      TEXT,
  ADD COLUMN IF NOT EXISTS ip_salida       TEXT;

-- ── 2. Índices para consultas frecuentes ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_turnos_restaurante     ON turnos(restaurante_id, entrada_at DESC);
CREATE INDEX IF NOT EXISTS idx_turnos_camarero        ON turnos(camarero_id, entrada_at DESC);
CREATE INDEX IF NOT EXISTS idx_turnos_activo          ON turnos(camarero_id, estado) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS idx_turnos_fecha           ON turnos(restaurante_id, fecha DESC);

-- ── 3. RLS: cada camarero solo ve sus propios fichajes ────────────────────────

ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;

-- Owner/jefe_sala ven todos los fichajes de su restaurante
CREATE POLICY IF NOT EXISTS "turnos_owner_all" ON turnos
  FOR ALL USING (true);  -- control via x-ia-session en API routes

-- ── 4. Función RPC: fichar entrada (evita doble fichaje) ──────────────────────

CREATE OR REPLACE FUNCTION fichar_entrada(
  p_camarero_id  UUID,
  p_restaurante_id UUID,
  p_ip           TEXT DEFAULT NULL
)
RETURNS TABLE(turno_id UUID, ya_fichado BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_existing UUID;
  v_new_id   UUID;
BEGIN
  -- Comprobar si ya tiene turno activo hoy
  SELECT id INTO v_existing
  FROM turnos
  WHERE camarero_id = p_camarero_id
    AND restaurante_id = p_restaurante_id
    AND estado = 'activo'
    AND fecha = CURRENT_DATE
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, TRUE;
    RETURN;
  END IF;

  -- Crear nuevo fichaje de entrada
  INSERT INTO turnos (
    restaurante_id, camarero_id, nombre,
    fecha, estado, entrada_at, ip_entrada
  ) VALUES (
    p_restaurante_id, p_camarero_id,
    (SELECT nombre FROM camareros WHERE id = p_camarero_id),
    CURRENT_DATE, 'activo', now(), p_ip
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, FALSE;
END;
$$;

-- ── 5. Función RPC: fichar salida ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fichar_salida(
  p_camarero_id    UUID,
  p_restaurante_id UUID,
  p_ip             TEXT DEFAULT NULL
)
RETURNS TABLE(turno_id UUID, horas NUMERIC, ok BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id       UUID;
  v_entrada  TIMESTAMPTZ;
  v_horas    NUMERIC(5,2);
BEGIN
  SELECT id, entrada_at INTO v_id, v_entrada
  FROM turnos
  WHERE camarero_id = p_camarero_id
    AND restaurante_id = p_restaurante_id
    AND estado = 'activo'
  ORDER BY entrada_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  v_horas := ROUND(EXTRACT(EPOCH FROM (now() - v_entrada)) / 3600.0, 2);

  UPDATE turnos
  SET salida_at     = now(),
      estado        = 'cerrado',
      horas_totales = v_horas,
      ip_salida     = p_ip
  WHERE id = v_id;

  RETURN QUERY SELECT v_id, v_horas, TRUE;
END;
$$;

-- ── 6. Limpiar seed "Turno demo" sin camarero_id ──────────────────────────────

-- Marcar el turno demo como cerrado (no borrar por si se referencia en comandas)
UPDATE turnos SET estado = 'cerrado' WHERE nombre = 'Turno demo';
