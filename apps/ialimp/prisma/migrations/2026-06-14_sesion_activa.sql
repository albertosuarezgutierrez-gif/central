-- Sesión abierta explícita (bloqueo del 2º login con aviso).
--
-- Antes: el 2º login rotaba el session_jti y EXPULSABA al primer dispositivo
-- (Vanessa veía "No autenticado" en el portátil al entrar desde el móvil).
-- Ahora: si ya hay una sesión activa en otro dispositivo, el 2º login NO entra
-- directo → avisa y ofrece "Entrar aquí y cerrar la otra" (forzar=true).
--
-- Se usa un flag explícito en vez de mirar session_jti porque session_jti
-- persiste tras logout y la regla de gracia de getSession (jti NULL = se acepta)
-- resucitaría tokens viejos. sesion_activa es TRUE solo mientras hay sesión viva:
--   login (o forzar) → sesion_activa = true
--   logout           → sesion_activa = false
-- El kick del dispositivo anterior lo sigue haciendo la rotación de session_jti.
ALTER TABLE empresas         ADD COLUMN IF NOT EXISTS sesion_activa boolean NOT NULL DEFAULT false;
ALTER TABLE usuarios_empresa ADD COLUMN IF NOT EXISTS sesion_activa boolean NOT NULL DEFAULT false;
