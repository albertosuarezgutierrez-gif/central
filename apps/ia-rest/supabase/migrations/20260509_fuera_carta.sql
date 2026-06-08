-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo Fuera de Carta — especiales del día con expiración automática
-- Los componentes FueraCartaSection (owner) y FueraCartaPill (edge) ya
-- existen en el frontend y esperan exactamente estos objetos.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Añadir campos a productos
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS es_fuera_carta BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expira_at      TIMESTAMPTZ;

-- Índice para acelerar el filtro de activos
CREATE INDEX IF NOT EXISTS idx_productos_fuera_carta
  ON productos(restaurante_id, es_fuera_carta, activo)
  WHERE es_fuera_carta = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vista v_fuera_carta_activos
--    Devuelve especiales activos con campos calculados para la UI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_fuera_carta_activos AS
SELECT
  p.id,
  p.restaurante_id,
  p.nombre,
  p.precio,
  p.descripcion,
  p.categoria,
  COALESCE(p.alergenos, '{}')  AS alergenos,
  p.expira_at,
  -- Horas restantes (null si no tiene expiración)
  CASE
    WHEN p.expira_at IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (p.expira_at - now())) / 3600)
  END::numeric(10,1)           AS horas_restantes,
  -- Etiqueta legible para la UI
  CASE
    WHEN p.expira_at IS NULL           THEN 'Sin caducidad'
    WHEN p.expira_at < now()           THEN 'Expirado'
    WHEN p.expira_at < now() + INTERVAL '2 hours'  THEN 'Menos de 2h'
    WHEN p.expira_at < now() + INTERVAL '6 hours'  THEN 'Menos de 6h'
    WHEN p.expira_at < now() + INTERVAL '24 hours' THEN 'Hoy'
    ELSE TO_CHAR(p.expira_at AT TIME ZONE 'Europe/Madrid', 'DD Mon')
  END                          AS expira_label,
  p.created_at
FROM productos p
WHERE p.es_fuera_carta = true
  AND p.activo = true
  AND (p.expira_at IS NULL OR p.expira_at > now())
ORDER BY p.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Función crear_fuera_carta
--    Crea un producto especial con expiración automática al final del día N
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crear_fuera_carta(
  p_restaurante_id UUID,
  p_nombre         TEXT,
  p_precio         NUMERIC,
  p_descripcion    TEXT    DEFAULT NULL,
  p_categoria      TEXT    DEFAULT 'Especiales',
  p_alergenos      TEXT[]  DEFAULT '{}',
  p_seccion_id     UUID    DEFAULT NULL,
  p_dias           INT     DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id       UUID;
  v_expira   TIMESTAMPTZ;
  v_orden    INT;
BEGIN
  -- Expiración: fin del día N en hora Madrid (23:59:59)
  -- p_dias = 0 → solo hoy; p_dias = 1 → mañana fin de día, etc.
  IF p_dias <= 0 THEN
    v_expira := (date_trunc('day', now() AT TIME ZONE 'Europe/Madrid')
                  + INTERVAL '1 day' - INTERVAL '1 second')
                  AT TIME ZONE 'Europe/Madrid';
  ELSE
    v_expira := (date_trunc('day', now() AT TIME ZONE 'Europe/Madrid')
                  + (p_dias || ' days')::INTERVAL
                  + INTERVAL '1 day' - INTERVAL '1 second')
                  AT TIME ZONE 'Europe/Madrid';
  END IF;

  -- Orden: al final de la carta
  SELECT COALESCE(MAX(orden), 0) + 1
    INTO v_orden
    FROM productos
   WHERE restaurante_id = p_restaurante_id;

  INSERT INTO productos (
    restaurante_id, nombre, precio, descripcion, categoria,
    alergenos, seccion_id, activo, es_fuera_carta, expira_at, orden
  ) VALUES (
    p_restaurante_id, p_nombre, p_precio, p_descripcion, p_categoria,
    p_alergenos, p_seccion_id, true, true, v_expira, v_orden
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. pg_cron: limpiar especiales expirados diariamente a las 00:05
--    (desactiva, no borra — el historial queda)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'fuera-carta-cleanup',
  '5 0 * * *',
  $$
    UPDATE productos
       SET activo = false
     WHERE es_fuera_carta = true
       AND activo = true
       AND expira_at IS NOT NULL
       AND expira_at < now();
  $$
);

COMMENT ON VIEW v_fuera_carta_activos IS
  'Especiales fuera de carta activos con campos calculados (horas_restantes, expira_label). '
  'Usada por FueraCartaPill (/edge) y FueraCartaSection (/owner).';

COMMENT ON FUNCTION crear_fuera_carta IS
  'Crea un producto especial fuera de carta con expiración automática al final del día N. '
  'p_dias=0 → solo hoy, p_dias=1 → mañana, etc. Expira a las 23:59:59 hora Madrid.';
