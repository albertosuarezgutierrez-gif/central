-- ── ¿Con qué ojos se miró la ficha? ─────────────────────────────────────────
-- `documentos_muro` dice si el Portal nos escondió la lista de documentos, pero
-- esa observación significa DOS cosas opuestas según quién mirara:
--
--   · leída en ANÓNIMO  → «identifícate y los verás» (gratis, un login)
--   · leída CON SESIÓN  → «el Portal no los publica a nadie»: hay que pedir la
--                          certificación de cargas al Registro (tasa + mañana)
--
-- Sin esta columna las dos se cuentan igual, y la ficha acabaría mandando a
-- Alberto a iniciar una sesión que el cron ya tenía abierta — un recado
-- imposible de cumplir que además esconde el trabajo real.
--
-- `null` = no consta (fichas leídas antes de que el cron supiera identificarse).
-- Ante ese null se mantiene el recado BARATO (mirar antes que pagar).
ALTER TABLE subastas
  ADD COLUMN IF NOT EXISTS documentos_sesion boolean;

-- Las fichas con muro leídas hasta hoy fueron TODAS anónimas: el cron no sabía
-- identificarse. Se deja constancia explícita en vez de dejarlas a null, que
-- aquí sería fingir una duda que no existe.
UPDATE subastas
SET documentos_sesion = false
WHERE fuente = 'boe'
  AND documentos_muro IS NOT NULL
  AND documentos_sesion IS NULL;
