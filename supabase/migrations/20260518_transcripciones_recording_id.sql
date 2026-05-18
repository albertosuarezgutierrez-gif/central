-- ia.rest · Idempotencia cross-instancia en transcripciones
-- Añade recording_id para que /api/transcribe no procese la misma
-- grabación dos veces cuando Vercel usa múltiples instancias lambda.

ALTER TABLE transcripciones
  ADD COLUMN IF NOT EXISTS recording_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripciones_recording_id
  ON transcripciones(recording_id)
  WHERE recording_id IS NOT NULL;
