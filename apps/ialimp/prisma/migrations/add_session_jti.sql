-- Sesión única por usuario (anti-compartir cuenta / cobro por asiento).
-- Cada login guarda un identificador de sesión (jti) que también va en el JWT;
-- si no coinciden, la sesión anterior deja de valer (un dispositivo activo a la vez).
ALTER TABLE empresas          ADD COLUMN IF NOT EXISTS session_jti text;
ALTER TABLE usuarios_empresa  ADD COLUMN IF NOT EXISTS session_jti text;
ALTER TABLE clientes          ADD COLUMN IF NOT EXISTS session_jti text;
