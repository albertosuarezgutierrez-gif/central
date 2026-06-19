-- Avisos proactivos por email (feature B): marca de cuándo se incluyó cada match
-- del radar en el digest enviado, para no repetirlo. ADITIVA (no toca datos).
ALTER TABLE concursos_radar_anuncios ADD COLUMN IF NOT EXISTS avisado_email_at timestamptz;

-- Índice parcial: el cron busca los aún no avisados por empresa.
CREATE INDEX IF NOT EXISTS ix_radar_anuncios_por_avisar
  ON concursos_radar_anuncios (empresa_id) WHERE avisado_email_at IS NULL;
