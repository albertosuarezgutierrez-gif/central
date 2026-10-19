-- 2026-10-19c — `correduria_pendiente_tg` admite el tipo `contacto_sugerido` (botón «✅ Añadir al directorio» del aviso
-- «Posible contacto nuevo de aseguradora»). Sin esto el INSERT falla el CHECK y el triaje manda el aviso de siempre,
-- sin botones. Idempotente. Datos de `datos`: email, nombre, asunto (se anulan al cerrar la sugerencia).
ALTER TABLE correduria_pendiente_tg DROP CONSTRAINT IF EXISTS correduria_pendiente_tg_tipo_check;
ALTER TABLE correduria_pendiente_tg ADD CONSTRAINT correduria_pendiente_tg_tipo_check
  CHECK (tipo IN ('peticion_datos', 'repregunta', 'recordatorio_cliente', 'tarificar', 'propuesta', 'contacto_sugerido'));
