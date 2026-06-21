-- Login email + contraseña para el super admin.
--
-- Hasta ahora /super se desbloqueaba con una llave secreta en la URL (cookie
-- __super_shield) + un PIN. Se añade un login normal de email + contraseña sobre
-- la fila super_admin de `personal`. La contraseña se guarda HASHEADA (bcrypt);
-- nunca en texto plano. El valor del hash se fija aparte (no en esta migración).

ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS email         TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Email único (case-insensitive) entre las filas que lo tengan. Permite NULL
-- para todo el personal que sigue usando solo PIN.
CREATE UNIQUE INDEX IF NOT EXISTS personal_email_lower_unique
  ON personal (lower(email))
  WHERE email IS NOT NULL;
