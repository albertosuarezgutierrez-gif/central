-- Ampliar pedidos_online con canales adicionales y pago presencial

-- Añadir tipo 'telefono' y 'mostrador' al check constraint
ALTER TABLE pedidos_online
  DROP CONSTRAINT IF EXISTS pedidos_online_tipo_check;

ALTER TABLE pedidos_online
  ADD CONSTRAINT pedidos_online_tipo_check
  CHECK (tipo IN ('delivery','recogida','telefono','mostrador'));

-- Método de cobro previsto
ALTER TABLE pedidos_online
  ADD COLUMN IF NOT EXISTS canal TEXT DEFAULT 'online'
    CHECK (canal IN ('online','telefono','mostrador')),
  ADD COLUMN IF NOT EXISTS cobro TEXT DEFAULT 'online'
    CHECK (cobro IN ('online','efectivo','tarjeta','contraentrega')),
  ADD COLUMN IF NOT EXISTS operador_nombre TEXT,
  ADD COLUMN IF NOT EXISTS tiempo_recogida_min INTEGER DEFAULT 20;

-- Índice para filtrar por canal en el panel
CREATE INDEX IF NOT EXISTS idx_pedidos_online_canal ON pedidos_online(canal);
CREATE INDEX IF NOT EXISTS idx_pedidos_online_created ON pedidos_online(restaurante_id, created_at DESC);
