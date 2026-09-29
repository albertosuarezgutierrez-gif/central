-- Emitir por Telegram una póliza NUEVA (29/09/2026). Ver lib/correduria-emision-nueva-tg.ts.
-- Una póliza nueva no sustituye a ninguna: `poliza_id` va NULL y la fila se reconoce por
-- `resumen->>'tipo' = 'nuevo'`. El freno de «envío anterior sin aclarar» y el «un solo resumen vivo»
-- de estas filas van por `project_id`, de ahí el índice.
ALTER TABLE correduria_asistente_emision ALTER COLUMN poliza_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_correduria_asistente_emision_proyecto ON correduria_asistente_emision (project_id, creada_at DESC);
