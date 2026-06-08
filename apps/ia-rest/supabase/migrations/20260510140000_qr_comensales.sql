-- ═══════════════════════════════════════════════════════════
-- MÓDULO QR — Comensales y precio fijo por persona
-- Mayo 2026
-- ═══════════════════════════════════════════════════════════

-- Config en mesas: precio fijo por persona (cubierto / menú)
ALTER TABLE mesas
  ADD COLUMN IF NOT EXISTS qr_precio_fijo_persona  NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS qr_precio_fijo_concepto TEXT DEFAULT 'Cubierto';
  -- concepto: "Cubierto", "Menú del día", "Menú degustación", etc.

-- Sesión cliente: número de comensales + total precio fijo aplicado
ALTER TABLE qr_sesiones_cliente
  ADD COLUMN IF NOT EXISTS num_comensales       INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS precio_fijo_aplicado NUMERIC(10,2) DEFAULT 0;
  -- precio_fijo_aplicado = num_comensales × qr_precio_fijo_persona

COMMENT ON COLUMN mesas.qr_precio_fijo_persona  IS 'Precio fijo por comensal (cubierto, menú). NULL = sin precio fijo.';
COMMENT ON COLUMN mesas.qr_precio_fijo_concepto IS 'Etiqueta del precio fijo (Cubierto, Menú del día...).';
COMMENT ON COLUMN qr_sesiones_cliente.num_comensales IS 'Número de personas en la mesa, introducido al escanear el QR.';
COMMENT ON COLUMN qr_sesiones_cliente.precio_fijo_aplicado IS 'Total precio fijo (num_comensales × precio_fijo_persona).';
