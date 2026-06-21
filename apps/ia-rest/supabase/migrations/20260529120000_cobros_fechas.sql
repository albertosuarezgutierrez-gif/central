-- ia.rest cobros — añadir fechas al portal de cobro
-- fecha_evento: fecha del evento (visible para el invitado)
-- fecha_limite_pago: cierre automático del portal

ALTER TABLE cobros_grupo
  ADD COLUMN IF NOT EXISTS fecha_evento       date,
  ADD COLUMN IF NOT EXISTS fecha_limite_pago  timestamptz;

COMMENT ON COLUMN cobros_grupo.fecha_evento IS 'Fecha del evento — visible para el invitado en el portal';
COMMENT ON COLUMN cobros_grupo.fecha_limite_pago IS 'El portal se cierra automáticamente al llegar esta fecha/hora. El cierre manual sigue disponible siempre.';
