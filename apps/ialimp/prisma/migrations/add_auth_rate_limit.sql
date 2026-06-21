-- Limitador de intentos de login respaldado en BD (el de memoria no sirve en
-- serverless: cada lambda tiene su propio contador). Clave = "<scope>:<ip>".
CREATE TABLE IF NOT EXISTS auth_rate_limit (
  key             text PRIMARY KEY,
  intentos        int  NOT NULL DEFAULT 0,
  ventana_inicio  timestamptz NOT NULL DEFAULT now(),
  bloqueado_hasta timestamptz
);
