-- 2026-06-25_retoque_borrador.sql
-- Agente de huéspedes: soporte para el botón "🔧 Retocar" (instrucción sobre el borrador)
-- y aprendizaje del par pregunta→respuesta.
ALTER TABLE mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS pregunta TEXT;
ALTER TABLE mensajes_pendientes_tg ADD COLUMN IF NOT EXISTS esperando_retoque BOOLEAN NOT NULL DEFAULT false;
