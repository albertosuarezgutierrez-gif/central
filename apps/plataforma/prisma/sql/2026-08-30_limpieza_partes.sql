-- Partes de incidencia de la limpieza (30/08/2026, idea de Alberto). Vanesa, desde su intranet,
-- puede dejar en la limpieza del día una nota rápida y/o una foto («se ha roto una mesa», «no
-- sale la luz»): queda registrada en ESA limpieza (property_id + fecha) y se avisa a Alberto
-- por Telegram con la foto.
--
-- La foto vive en la propia BD (bytea, comprimida en el cliente a ~1600px JPEG) a propósito:
-- plataforma no tiene envs de Supabase Storage y así no se introduce ningún secreto nuevo.
-- Se sirve por una ruta autenticada de la intranet; a Telegram va por subida multipart.
-- texto/foto en NULL = «no aportado» (un parte puede ser solo texto o solo foto, nunca ninguno).
-- avisado_at NULL = el Telegram no llegó a enviarse (best-effort), no «sin novedad».

CREATE TABLE IF NOT EXISTS limpieza_partes (
  id BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  fecha DATE NOT NULL,
  texto TEXT,
  foto BYTEA,
  foto_mime TEXT,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  avisado_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_limpieza_partes_fecha ON limpieza_partes (fecha, property_id);
