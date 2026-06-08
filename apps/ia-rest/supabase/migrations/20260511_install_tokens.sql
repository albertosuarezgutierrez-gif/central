-- Migración: tokens de instalación QR para camareros
-- Ejecutar en Supabase SQL Editor

ALTER TABLE camareros
  ADD COLUMN IF NOT EXISTS install_token TEXT,
  ADD COLUMN IF NOT EXISTS install_token_expira_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS install_token_usado BOOLEAN DEFAULT FALSE;

-- Índice único para búsqueda rápida por token
CREATE UNIQUE INDEX IF NOT EXISTS idx_camareros_install_token
  ON camareros(install_token)
  WHERE install_token IS NOT NULL;

-- Comentarios
COMMENT ON COLUMN camareros.install_token IS 'Token único (hex 32 chars) para acceso QR de instalación PWA. Un solo uso.';
COMMENT ON COLUMN camareros.install_token_expira_at IS 'Expiración del token (24h desde generación).';
COMMENT ON COLUMN camareros.install_token_usado IS 'TRUE si el token ya fue consumido (escaneo exitoso).';
