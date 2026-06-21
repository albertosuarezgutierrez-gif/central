-- Login de propietario por email+contraseña (aditivo, no destructivo).
-- Aplicado en Supabase `wswbehlcuxqxyinousql` el 2026-06-02.
-- Tablas IALIMP gestionadas por SQL crudo (no van en schema.prisma).

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS login_email text,
  ADD COLUMN IF NOT EXISTS login_email_verificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS ultimo_login_at timestamptz;

-- login_email único (case-insensitive) cuando está definido: el login debe ser inequívoco.
CREATE UNIQUE INDEX IF NOT EXISTS clientes_login_email_uniq
  ON clientes (lower(login_email)) WHERE login_email IS NOT NULL;

-- Tokens de verificación / fijar contraseña (un solo uso, con caducidad).
CREATE TABLE IF NOT EXISTS cliente_auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  empresa_id  uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  purpose     text NOT NULL DEFAULT 'set_password',
  email       text,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cliente_auth_tokens_cliente_idx ON cliente_auth_tokens (cliente_id);
