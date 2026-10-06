-- Acceso del empleado por EMAIL + CÓDIGO (05/10/2026). PENDIENTE de aplicar en producción.
-- Idempotente. Sin esto, `/e/entrar` falla (500) y `getSesionEmpleado` también: aplicar ANTES
-- de desplegar el código (el enlace /e/<token> sigue necesitando `sesion_version`).
--
-- 1) Códigos de un solo uso. Se escribe una fila por CADA petición, exista o no el email
--    (no enumeración). Ni el email ni el código en claro: HMAC con JWT_SECRET (lib/acceso-email.ts).
CREATE TABLE IF NOT EXISTS rrhh.acceso_otps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash   text NOT NULL,                -- HMAC del email normalizado (trim + minúsculas)
  codigo_hash  text NOT NULL,                -- HMAC del código de 6 dígitos
  ip           text NOT NULL DEFAULT 'unknown', -- para el tope por IP (filas de >1 día se borran)
  intentos     int  NOT NULL DEFAULT 0,      -- intentos de código (máx. 5, se reservan antes de comparar)
  intentos_pin int  NOT NULL DEFAULT 0,      -- intentos de PIN tras un código válido (máx. 5)
  creada_at    timestamptz NOT NULL DEFAULT now(),  -- caduca a los 10 min (regla en código)
  usado_at     timestamptz
);
CREATE INDEX IF NOT EXISTS acceso_otps_email_idx ON rrhh.acceso_otps (email_hash, creada_at DESC);
CREATE INDEX IF NOT EXISTS acceso_otps_ip_idx    ON rrhh.acceso_otps (ip, creada_at);
CREATE INDEX IF NOT EXISTS acceso_otps_creada_idx ON rrhh.acceso_otps (creada_at);
-- Igual que el resto del schema: RLS on, el backend entra con rrhh_app (BYPASSRLS).
ALTER TABLE rrhh.acceso_otps ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON rrhh.acceso_otps TO rrhh_app;

-- 2) Revocación de sesiones: el token del empleado lleva esta versión; «Cerrar sesiones» y
--    «Nuevo enlace» la suben y toda cookie anterior deja de valer.
ALTER TABLE rrhh.empleados ADD COLUMN IF NOT EXISTS sesion_version int NOT NULL DEFAULT 0;

-- 3) Búsqueda por email (normalizado igual que en código).
CREATE INDEX IF NOT EXISTS empleados_email_norm_idx ON rrhh.empleados (lower(trim(email))) WHERE email IS NOT NULL;
