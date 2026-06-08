-- Marca cuándo se intentó rastrear el email de la web de un prospecto, para que el
-- rastreo automático (tras Apify / botón "Buscar emails") recorra TODAS las webs una
-- sola vez en lotes, sin repetir las que ya se intentaron (con o sin éxito).
ALTER TABLE mailing_prospectos ADD COLUMN IF NOT EXISTS email_buscado_at timestamptz;
