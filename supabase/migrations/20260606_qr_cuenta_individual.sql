-- QR cuenta individual — "cada uno pide su caña y se le cobra lo suyo"
-- Permite que cada comensal abra su propia subcuenta bajo la misma mesa (mismo QR,
-- su propio móvil) y se le cobre SOLO su consumición. Todo es configurable por el
-- dueño: por defecto 'mesa_unica' → comportamiento idéntico al actual.

-- 1. Config del dueño: modo de consumo de la mesa QR
--    'mesa_unica'   → una sola cuenta por mesa (comportamiento actual)
--    'individual'   → cada persona su propia cuenta (cada móvil = subcuenta)
--    'cliente_elige'→ el cliente elige al escanear (cuenta propia / cuenta de mesa)
ALTER TABLE cobro_config
  ADD COLUMN IF NOT EXISTS qr_modo_consumo TEXT DEFAULT 'mesa_unica';

-- 2. Identidad de subcuenta en la sesión QR
--    device_id      → identifica el móvil del comensal (localStorage del cliente)
--    nombre_cliente → nombre opcional ("Alberto") para que el camarero sepa de quién es
--    tipo           → 'mesa' (cuenta compartida, legado) | 'individual' (cuenta propia)
ALTER TABLE qr_sesiones_cliente
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS nombre_cliente TEXT,
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'mesa';

-- Una subcuenta activa por (mesa, móvil): permite reconectar al recargar el navegador.
-- UNIQUE para garantizar la invariante (no duplicar subcuentas del mismo móvil). Las
-- sesiones 'mesa' guardan device_id NULL → no chocan (NULLs son distintos en Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_sesiones_mesa_device
  ON qr_sesiones_cliente (mesa_id, device_id)
  WHERE estado = 'activa';

-- 3. Vínculo persona ↔ item: cada comanda nace atada a la subcuenta que la pidió.
--    Es el eslabón que permite cobrar a cada uno SOLO lo suyo (vs. sumar por mesa).
ALTER TABLE comandas
  ADD COLUMN IF NOT EXISTS sesion_qr_id UUID;

CREATE INDEX IF NOT EXISTS idx_comandas_sesion_qr
  ON comandas (sesion_qr_id)
  WHERE sesion_qr_id IS NOT NULL;
