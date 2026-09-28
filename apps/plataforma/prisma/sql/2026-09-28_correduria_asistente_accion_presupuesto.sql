-- El asistente de Telegram también envía presupuestos (tarificación guardada → portal del cliente).
ALTER TABLE correduria_asistente_accion DROP CONSTRAINT IF EXISTS correduria_asistente_accion_tipo_check;
ALTER TABLE correduria_asistente_accion ADD CONSTRAINT correduria_asistente_accion_tipo_check
  CHECK (tipo IN ('tarea', 'llamada', 'nota', 'siniestro', 'portal', 'presupuesto'));
