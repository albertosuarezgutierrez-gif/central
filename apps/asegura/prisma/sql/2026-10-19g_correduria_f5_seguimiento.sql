-- 2026-10-19g_correduria_f5_seguimiento.sql — Seguimiento del lead por correo (spec 2026-10-19 lead → propuesta, F5).
-- SIN APLICAR: lo aplica Alberto. Va DESPUÉS de 2026-10-19e (F4).
--
-- Columnas nuevas en `seguros.correduria_hilo` (F1, 2026-10-19b) para que el cron del triaje sepa QUÉ recordar y
-- cuándo, siempre desde el último envío REAL registrado en el hilo:
--   · `ultimo_recordatorio_at` / `recordatorios_enviados`: los recordatorios que de verdad salieron (con el ✅ de Alberto
--     o en automático). Se cuentan desde el envío base (petición/repregunta o propuesta); un recordatorio anterior a la
--     base no cuenta (lo decide `hitoSeguimientoLead` de `@central/module-seguros`).
--   · `cerrado_perdido_at` / `cerrado_por`: «🗑 Cerrar perdida». No borra nada: las oportunidades pasan a `perdida`
--     (motivo `sin_respuesta`) por el camino de siempre y queda historial en la ficha.
-- La PROPUESTA no tiene columnas propias aquí: F5 lee las de F4 (`presupuesto_id` + `propuesta_enviada_at`, SQL
-- 2026-10-19e), que escribe `marcarHiloPropuesta` (`lib/propuesta-lead.ts`). Una sola fuente de verdad.
--
-- No toca ningún CHECK existente (`correduria_hilo_estado_datos_check` sigue como lo dejó F4): solo AÑADE uno nuevo
-- sobre una columna nueva.
--
-- Orden: el código va ANTES que el SQL. Sin estas columnas el puerto `seguimiento-lead` contesta 503 `sin_migracion` y
-- el cron no avisa de nada (nunca «no hay nada que recordar»). Idempotente.

ALTER TABLE seguros.correduria_hilo ADD COLUMN IF NOT EXISTS ultimo_recordatorio_at   timestamptz;
ALTER TABLE seguros.correduria_hilo ADD COLUMN IF NOT EXISTS recordatorios_enviados   smallint NOT NULL DEFAULT 0;
ALTER TABLE seguros.correduria_hilo ADD COLUMN IF NOT EXISTS cerrado_perdido_at       timestamptz;
ALTER TABLE seguros.correduria_hilo ADD COLUMN IF NOT EXISTS cerrado_por              text;

DO $$ BEGIN
  ALTER TABLE seguros.correduria_hilo ADD CONSTRAINT correduria_hilo_recordatorios_rango CHECK (recordatorios_enviados BETWEEN 0 AND 20);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El cron lee los hilos vivos (sin cerrar) con algo que esperar.
CREATE INDEX IF NOT EXISTS correduria_hilo_seguimiento
  ON seguros.correduria_hilo (correduria_id, ultima_peticion_at)
  WHERE cerrado_perdido_at IS NULL;

COMMENT ON COLUMN seguros.correduria_hilo.recordatorios_enviados IS
  'F5: recordatorios ENVIADOS desde el envío base (petición/repregunta o propuesta). Un aviso descartado no cuenta.';
