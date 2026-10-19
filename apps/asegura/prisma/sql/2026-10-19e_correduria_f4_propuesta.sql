-- 2026-10-19e_correduria_f4_propuesta.sql — F4: propuesta de un lead enviada EN SU HILO (spec 2026-10-19 lead → propuesta §F4).
-- SIN APLICAR: lo aplica Alberto.
--
-- `seguros.correduria_hilo` gana el estado `propuesta_enviada` (§1.4: … → tarificada → propuesta enviada) y dos columnas
-- que deja la F4 para la F5 (seguimiento «propuesta sin aceptar 72 h», aún sin implementar):
--   · `presupuesto_id`        el presupuesto que salió (el de la oferta que pulsó Alberto);
--   · `propuesta_enviada_at`  cuándo salió.
--
-- Orden: el código va ANTES que el SQL. Sin él, el correo de la propuesta sale igual y el puerto dice `hilo: 'sin_sql'`
-- (el CHECK viejo no admite el estado): el hilo se queda en `tarificada` y el triaje no lo vuelve a proponer porque el
-- pendiente de Telegram ya está `enviado`. Idempotente.

ALTER TABLE seguros.correduria_hilo DROP CONSTRAINT IF EXISTS correduria_hilo_estado_datos_check;
ALTER TABLE seguros.correduria_hilo ADD CONSTRAINT correduria_hilo_estado_datos_check CHECK (estado_datos IN
  ('sin_pedir', 'pedida', 'incompleta', 'lista_para_tarificar', 'tarificando', 'tarificada', 'propuesta_enviada', 'fallo'));

ALTER TABLE seguros.correduria_hilo ADD COLUMN IF NOT EXISTS presupuesto_id uuid REFERENCES seguros.presupuesto (id) ON DELETE SET NULL;
ALTER TABLE seguros.correduria_hilo ADD COLUMN IF NOT EXISTS propuesta_enviada_at timestamptz;

-- F5 buscará «propuesta enviada hace más de 72 h y sin aceptar»: índice parcial pequeño.
CREATE INDEX IF NOT EXISTS correduria_hilo_propuesta
  ON seguros.correduria_hilo (correduria_id, propuesta_enviada_at) WHERE estado_datos = 'propuesta_enviada';

COMMENT ON COLUMN seguros.correduria_hilo.presupuesto_id IS 'F4 (19/10/2026): presupuesto de la propuesta enviada en el hilo (la oferta exacta que pulsó Alberto).';
COMMENT ON COLUMN seguros.correduria_hilo.propuesta_enviada_at IS 'F4: cuándo salió la propuesta. Lo leerá F5 (seguimiento); NULL = no se ha enviado.';
