-- Fix: el índice idx_qr_sesiones_mesa_device se creó como NO único, pero el código
-- (qr-session: recover por device) asume "una subcuenta activa por (mesa, móvil)".
-- Lo convertimos a UNIQUE para garantizar la invariante y evitar duplicados que
-- harían fallar el recover (.maybeSingle()).
--
-- Las sesiones 'mesa' ahora guardan device_id NULL → no chocan (NULLs distintos).
-- Si hubiera duplicados previos en estado 'activa', desactivamos los más antiguos
-- antes de crear el índice único.

UPDATE qr_sesiones_cliente s
SET estado = 'abandonada'
WHERE estado = 'activa'
  AND device_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM qr_sesiones_cliente o
    WHERE o.estado = 'activa'
      AND o.mesa_id = s.mesa_id
      AND o.device_id = s.device_id
      AND o.creado_en > s.creado_en
  );

DROP INDEX IF EXISTS idx_qr_sesiones_mesa_device;

CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_sesiones_mesa_device
  ON qr_sesiones_cliente (mesa_id, device_id)
  WHERE estado = 'activa';
