-- ─────────────────────────────────────────────────────────────────────────────
-- Fuera de Carta — Control de Stock (raciones)
-- Permite limitar un especial por número de raciones además de por tiempo.
-- Cuando stock_restante llega a 0 → desaparece de la vista del camarero.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Nuevas columnas en productos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS stock_raciones   INTEGER   DEFAULT NULL, -- raciones iniciales
  ADD COLUMN IF NOT EXISTS stock_restante   INTEGER   DEFAULT NULL, -- raciones que quedan
  ADD COLUMN IF NOT EXISTS stock_agotado_at TIMESTAMPTZ DEFAULT NULL; -- cuándo se agotó

-- Índice para el filtro de agotados
CREATE INDEX IF NOT EXISTS idx_productos_stock
  ON productos(restaurante_id, es_fuera_carta, stock_restante)
  WHERE es_fuera_carta = true AND stock_raciones IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Vista v_fuera_carta_activos (OWNER)
--    Incluye todos los especiales activos aunque estén agotados,
--    para que el owner pueda ver el estado y reponer stock.
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
  CASE
    WHEN p.expira_at IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(EPOCH FROM (p.expira_at - now())) / 3600)
  END::numeric(10,1)           AS horas_restantes,
  CASE
    WHEN p.expira_at IS NULL                             THEN 'Sin caducidad'
    WHEN p.expira_at < now()                             THEN 'Expirado'
    WHEN p.expira_at < now() + INTERVAL '2 hours'       THEN 'Menos de 2h'
    WHEN p.expira_at < now() + INTERVAL '6 hours'       THEN 'Menos de 6h'
    WHEN p.expira_at < now() + INTERVAL '24 hours'      THEN 'Hoy'
    ELSE TO_CHAR(p.expira_at AT TIME ZONE 'Europe/Madrid', 'DD Mon')
  END                          AS expira_label,
  -- Stock
  p.stock_raciones,
  p.stock_restante,
  p.stock_agotado_at,
  (p.stock_raciones IS NOT NULL AND COALESCE(p.stock_restante, 0) <= 0) AS stock_agotado,
  p.created_at
FROM productos p
WHERE p.es_fuera_carta = true
  AND p.activo = true
  AND (p.expira_at IS NULL OR p.expira_at > now())
ORDER BY p.created_at DESC;

COMMENT ON VIEW v_fuera_carta_activos IS
  'Vista OWNER: todos los especiales activos incluyendo agotados. '
  'Usada por FueraCartaSection en /owner.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vista v_fuera_carta_disponibles (CAMARERO / EDGE)
--    Solo especiales con stock disponible — lo que el camarero puede ofrecer.
--    Sustituye a v_fuera_carta_activos en FueraCartaPill (/edge).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_fuera_carta_disponibles AS
SELECT *
FROM v_fuera_carta_activos
WHERE stock_raciones IS NULL
   OR COALESCE(stock_restante, 0) > 0;

COMMENT ON VIEW v_fuera_carta_disponibles IS
  'Vista CAMARERO: solo especiales con stock > 0 (o sin límite). '
  'Usada por FueraCartaPill en /edge.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Actualizar función crear_fuera_carta → nuevo parámetro p_stock
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crear_fuera_carta(
  p_restaurante_id UUID,
  p_nombre         TEXT,
  p_precio         NUMERIC,
  p_descripcion    TEXT    DEFAULT NULL,
  p_categoria      TEXT    DEFAULT 'Especiales',
  p_alergenos      TEXT[]  DEFAULT '{}',
  p_seccion_id     UUID    DEFAULT NULL,
  p_dias           INT     DEFAULT 1,
  p_stock          INT     DEFAULT NULL   -- NULL = sin límite de raciones
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
    alergenos, seccion_id, activo, es_fuera_carta, expira_at, orden,
    stock_raciones, stock_restante
  ) VALUES (
    p_restaurante_id, p_nombre, p_precio, p_descripcion, p_categoria,
    p_alergenos, p_seccion_id, true, true, v_expira, v_orden,
    p_stock, p_stock   -- stock_restante arranca igual que stock_raciones
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION crear_fuera_carta IS
  'Crea especial fuera de carta. p_dias=0→solo hoy. p_stock=NULL→sin límite raciones.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. decrementar_stock_fuera_carta — decremento atómico (FOR UPDATE)
--    Retorna: ok, restante, agotado
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrementar_stock_fuera_carta(
  p_producto_id    UUID,
  p_restaurante_id UUID,
  p_cantidad       INT DEFAULT 1
)
RETURNS TABLE(ok BOOLEAN, restante INT, agotado BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_restante INT;
  v_agotado  BOOLEAN;
BEGIN
  -- Bloqueo FOR UPDATE para evitar condición de carrera
  -- (dos camareros pidiendo la última ración al mismo tiempo)
  UPDATE productos
  SET
    stock_restante   = GREATEST(0, stock_restante - p_cantidad),
    stock_agotado_at = CASE
                         WHEN GREATEST(0, stock_restante - p_cantidad) = 0
                         THEN now()
                         ELSE stock_agotado_at
                       END
  WHERE id              = p_producto_id
    AND restaurante_id  = p_restaurante_id
    AND es_fuera_carta  = true
    AND stock_raciones  IS NOT NULL
    AND stock_restante  > 0
  RETURNING stock_restante, (stock_restante = 0)
    INTO v_restante, v_agotado;

  IF NOT FOUND THEN
    -- Sin stock o producto sin límite de raciones
    RETURN QUERY SELECT false, NULL::INT, false;
  ELSE
    RETURN QUERY SELECT true, v_restante, v_agotado;
  END IF;
END;
$$;

COMMENT ON FUNCTION decrementar_stock_fuera_carta IS
  'Decrementa atómicamente el stock de un especial fuera de carta. '
  'Retorna ok=false si no hay stock o si el producto no tiene límite.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. reponer_stock_fuera_carta — restaurar raciones (owner)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reponer_stock_fuera_carta(
  p_producto_id    UUID,
  p_restaurante_id UUID,
  p_nuevo_stock    INT DEFAULT NULL  -- NULL = restaurar al original
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE productos
  SET
    stock_raciones   = COALESCE(p_nuevo_stock, stock_raciones),
    stock_restante   = COALESCE(p_nuevo_stock, stock_raciones),
    stock_agotado_at = NULL
  WHERE id             = p_producto_id
    AND restaurante_id = p_restaurante_id
    AND es_fuera_carta = true;
END;
$$;

COMMENT ON FUNCTION reponer_stock_fuera_carta IS
  'Repone el stock de un especial. p_nuevo_stock=NULL → restaurar al valor original.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Trigger en comanda_items: decrementar stock automáticamente
--    Cuando se añade un item con producto_id apuntando a un especial con stock,
--    lo decrementa. Cubre voz, manual y QR.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_decrementar_stock_comanda_item()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Solo si el item tiene producto_id y el producto es fuera_carta con stock
  IF NEW.producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE productos
  SET
    stock_restante   = GREATEST(0, stock_restante - NEW.cantidad),
    stock_agotado_at = CASE
                         WHEN GREATEST(0, stock_restante - NEW.cantidad) = 0
                         THEN now()
                         ELSE stock_agotado_at
                       END
  WHERE id             = NEW.producto_id
    AND restaurante_id = NEW.restaurante_id
    AND es_fuera_carta = true
    AND stock_raciones IS NOT NULL
    AND stock_restante > 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_comanda_item ON comanda_items;
CREATE TRIGGER trg_stock_comanda_item
  AFTER INSERT ON comanda_items
  FOR EACH ROW
  EXECUTE FUNCTION trg_decrementar_stock_comanda_item();

COMMENT ON FUNCTION trg_decrementar_stock_comanda_item IS
  'Trigger: decrementa stock de fuera_carta cuando se inserta un comanda_item. '
  'Cubre todos los flujos: voz, manual y QR.';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX (mismo día): seccion NOT NULL DEFAULT 'otras' — corrección columna
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crear_fuera_carta(
  p_restaurante_id UUID,
  p_nombre         TEXT,
  p_precio         NUMERIC,
  p_descripcion    TEXT    DEFAULT NULL,
  p_categoria      TEXT    DEFAULT 'Especiales',
  p_alergenos      TEXT[]  DEFAULT '{}',
  p_seccion_id     UUID    DEFAULT NULL,
  p_dias           INT     DEFAULT 1,
  p_stock          INT     DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id     UUID;
  v_expira TIMESTAMPTZ;
  v_orden  INT;
BEGIN
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
  SELECT COALESCE(MAX(orden), 0) + 1 INTO v_orden
    FROM productos WHERE restaurante_id = p_restaurante_id;
  INSERT INTO productos (
    restaurante_id, nombre, precio, descripcion, categoria,
    alergenos, seccion, activo, es_fuera_carta, expira_at, orden,
    stock_raciones, stock_restante
  ) VALUES (
    p_restaurante_id, p_nombre, p_precio, p_descripcion, p_categoria,
    p_alergenos,
    COALESCE(p_seccion_id::TEXT, 'otras'),
    true, true, v_expira, v_orden,
    p_stock, p_stock
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Eliminar versión antigua sin p_stock (overload huérfano)
DROP FUNCTION IF EXISTS crear_fuera_carta(uuid, text, numeric, text, text, text[], uuid, integer);
